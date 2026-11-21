# ADR-0005: 5-minute holds and a SQL sweeper

**Status:** Accepted

## Context

Members need time to pay, but abandoned holds must return seats quickly. Expiry must never
release a seat whose payment is in flight.

## Decision

* `expires_at = now() + HOLD_TTL_SECONDS` (300) is set by the database clock at insert.
* Checkout is valid only if `expires_at > now()` **at the conditional update**, so the
  boundary is decided atomically. A late checkout gets `410 RESERVATION_EXPIRED` even before the sweeper runs.
* The sweeper (every 5 s) runs, in one transaction per batch of 500:
  `UPDATE reservations … FROM (SELECT id … WHERE status='HELD' AND expires_at < now() … FOR UPDATE SKIP LOCKED)`
  → release those reservations' seats (`WHERE reservation_id = ANY(…) AND status='HELD'`)
  → increment `user_behavior.expired_holds_count` → one audit entry. Redis counters are adjusted after commit.
* `PAYMENT_PENDING` can never match (`status='HELD'` predicate, plus the trigger forbids
  `PAYMENT_PENDING → EXPIRED`).
* Jobs run with `@nestjs/schedule` intervals and `JobRunner`: an in-process overlap guard plus
  `pg_try_advisory_lock` so that only one instance sweeps.

## Consequences

* A seat can stay `HELD` for up to about 5 s after expiry. The listing tolerates 5 s staleness,
  and booking is authoritative.
* No extra infrastructure. Horizontal scaling is safe without leader election.

## Alternatives considered

* **BullMQ repeatable / delayed jobs per hold.** Precise timing, but adds Redis durability as a
  dependency of seat release and a dual write at hold creation.
* **Redis key expiry notifications.** Not reliable (fire-and-forget pub/sub).
* **Lazy expiry only (on read).** Leaves seats blocked until someone looks; still needs a sweeper.
