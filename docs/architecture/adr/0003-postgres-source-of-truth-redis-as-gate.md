# ADR-0003: PostgreSQL is the source of truth; Redis is a gate and cache

**Status:** Accepted

## Context
Under contention (1,000 members, one Jameya), most requests are doomed. We want to reject them
cheaply, but a cache is never a safe arbiter of who gets a seat.

## Decision
* Seat ownership is decided **only** by the conditional `UPDATE seats … WHERE status='AVAILABLE'`
  inside the reservation transaction, backed by unique/partial indexes and triggers.
* Redis provides:
  * a per-Jameya **available-seat counter**: `≤ 0` gives `409 JAMEYA_FULL` without touching the DB.
    It is decremented/incremented after commits and **rebuilt from PostgreSQL every 10 s**
    (drift is bounded and self-healing);
  * a per-seat **single-flight lock** (`SET NX PX 3000`): only one in-flight DB claim per seat;
    concurrent requests for that seat fail fast with `409 SEAT_UNAVAILABLE`;
  * rate limiting, KYC cache, and idempotency are separate concerns. Idempotency uses PostgreSQL.
* Any Redis error **admits** the request (fail open to the authoritative DB). Rate limiting also
  fails open. KYC falls back to the provider.

## Consequences
* Redis loss degrades latency and load shedding, never correctness.
* The counter can be briefly wrong (≤ 10 s). A false "full" is possible right after releases;
  this trade-off is documented in [high-contention](../../contention/high-contention.md).
* The single-flight lock can reject a request whose competitor later fails a business check.
  The member retries; fairness is discussed in the same document.

## Alternatives considered
* **Redis as the allocator (DECR tokens, Lua seat map).** Faster, but then Redis must be durable and
  consistent with PostgreSQL. That creates a dual-write problem on the money path.
* **`SELECT … FOR UPDATE` then `UPDATE`.** Correct, but a conditional `UPDATE` does the same in one
  statement with the same lock semantics.
* **SERIALIZABLE isolation.** Correct, but under contention it turns most requests into
  serialization failures that need retries.
