# Database

PostgreSQL 16 is the system of record. The schema lives in
[`backend/migrations/0001_initial_schema.sql`](../../backend/migrations/0001_initial_schema.sql).
Migrations are forward-only, run in one transaction per file, and are serialised across instances
by an advisory lock (`backend/src/shared/database/migrator.ts`). They run automatically on
container start, followed by the idempotent seed.

## ERD

Solid lines are foreign keys within a module. Dotted lines are cross-module UUID references
(deliberately without foreign keys, see [modules.md](modules.md#boundary-rules)).

```mermaid
erDiagram
  users ||--o| user_behavior : "users"
  users ||--o| kyc_simulator_profiles : "users (simulator)"
  jameyas ||--|{ seats : "catalog"
  jameyas ||--o{ featured_campaigns : "catalog"
  payments ||--o{ ledger_entries : "payments"
  payments ||--o| payment_outbox : "payments"
  reservations ||..o| payments : "reservation_id (unique)"
  reservations ||..|| seats : "seats.reservation_id"
  users ||..o{ reservations : "user_id"
  jameyas ||..o{ reservations : "jameya_id"
  payments ||..o{ payment_events : "payment_intent_id"

  users { uuid id PK; text email UK; text risk_tier; bigint typical_monthly_amount; int[] preferred_durations }
  user_behavior { uuid user_id PK; int expired_holds_count; int confirmed_count; bigint confirmed_monthly_total }
  jameyas { uuid id PK; text code UK; text name; bigint monthly_amount; int duration_months; date start_date }
  seats { uuid jameya_id PK; int seat_number PK; bigint fee; text status; uuid reservation_id; uuid holder_user_id }
  featured_campaigns { uuid id PK; uuid jameya_id; text campaign; int priority; timestamptz starts_at; timestamptz ends_at }
  reservations { uuid id PK; uuid user_id; uuid jameya_id; int seat_number; bigint fee; text status; text failure_reason; timestamptz expires_at }
  payments { uuid id PK; uuid reservation_id UK; bigint amount; text status; text provider_intent_id UK }
  payment_events { text event_id PK; text type; text payment_intent_id; jsonb payload; text outcome }
  ledger_entries { bigserial id PK; uuid payment_id; text entry_type; bigint amount }
  payment_outbox { uuid id PK; uuid payment_id UK; text command; text status; int attempts; timestamptz next_attempt_at }
  idempotency_keys { uuid user_id PK; uuid key PK; text request_hash; text status; int response_status; jsonb response_body }
  analytics_events { bigserial id PK; uuid user_id; text type; uuid jameya_id; text experiment_key; text variant }
  audit_log { bigserial id PK; text actor; text action; text entity_type; text entity_id; jsonb data; text trace_id }
```

Money is always `bigint` minor units (halalas). The currency is constrained to `SAR`.

## Invariants and the constraints that protect them

| Invariant | Enforced by | Notes |
|---|---|---|
| A seat exists once per Jameya | `seats` PK `(jameya_id, seat_number)` | |
| A seat is claimed by at most one request | `UPDATE seats SET status='HELD' … WHERE … AND status='AVAILABLE' RETURNING` in the same transaction as the reservation `INSERT` | Row lock + predicate re-check under READ COMMITTED: exactly one winner. |
| At most one live reservation per seat | partial unique index `reservations_live_seat_uq (jameya_id, seat_number) WHERE status IN ('HELD','PAYMENT_PENDING','CONFIRMED')` | Second line of defence if the seat update were ever bypassed. |
| At most one active hold per member per Jameya | partial unique index `reservations_active_user_jameya_uq (user_id, jameya_id) WHERE status IN ('HELD','PAYMENT_PENDING')` | Mapped to `409 ACTIVE_RESERVATION_EXISTS`. |
| A reservation owns at most one seat | partial unique index `seats_reservation_uq (reservation_id)` | |
| Held seats always name their holder; free seats name nobody | CHECK `seat_available_has_no_holder`, `seat_held_has_reservation` | |
| Only legal lifecycle moves | triggers `reservations_status_guard`, `payments_status_guard`, `seats_status_guard` (`guard_status_transition`) | E.g. `PAYMENT_PENDING → EXPIRED` and `CAPTURED → VOIDED` are impossible. |
| Failed/expired reservations carry a reason | CHECK on `reservations` | |
| One payment per reservation, ever | `payments.reservation_id UNIQUE` | A retried checkout cannot open a second authorization. |
| Provider intent maps to one payment | `payments.provider_intent_id UNIQUE` | |
| Each provider event is processed once | `payment_events.event_id` PK + `ON CONFLICT DO NOTHING` | Duplicate callbacks → `duplicate: true`. |
| A payment is either captured or voided, once | `payment_outbox_single_settlement_uq (payment_id)` | |
| Ledger cannot double count | `ledger_entries UNIQUE (payment_id, entry_type)` + append-only triggers | No second CAPTURE row can exist. |
| Audit is tamper-evident | `audit_log` append-only triggers (row and TRUNCATE) | |
| Idempotency per member and key | `idempotency_keys` PK `(user_id, key)` + request hash | |

## Indexes for hot paths

| Index | Serves |
|---|---|
| `reservations_held_expiry_idx (expires_at) WHERE status='HELD'` | Sweeper scans only expirable rows. |
| `reservations_user_created_idx (user_id, created_at DESC)` | `GET /reservations`, active-hold counts. |
| `seats_available_idx (jameya_id) WHERE status='AVAILABLE'` | Gate rebuild and availability counts. |
| `payments_authorizing_idx (created_at) WHERE status='AUTHORIZING'` | Reconciliation scan. |
| `payment_outbox_due_idx (next_attempt_at) WHERE status='PENDING'` | Outbox relay polling. |
| `payment_events_orphan_idx (received_at) WHERE outcome='ORPHAN'` | Orphan retry. |
| `idempotency_keys_expiry_idx (expires_at)` | 24 h purge. |
| `featured_campaigns_window_idx (starts_at, ends_at)` | Active campaign lookup. |
| `analytics_events_experiment_idx (experiment_key, variant, type)` | Experiment readouts. |

## Concurrency notes

* Isolation level is READ COMMITTED. Correctness comes from **conditional writes** (predicate
  in `WHERE`, checked on the locked latest row version) rather than read-then-write.
* The per-member hold limit is a check-then-act across rows. It is serialised with
  `pg_advisory_xact_lock(hashtext('reservations:user:<id>'))` inside the booking transaction.
* The sweeper uses `FOR UPDATE SKIP LOCKED`, so it never waits for, or fights, a checkout that is
  holding the same row. The checkout's own `expires_at > now()` predicate decides that race.
* Webhook processing locks the payment row (`FOR UPDATE`) after inserting the event, so concurrent
  different events for one payment are applied one at a time.

## Seed

`node dist/cli/seed.js` (run by the entrypoint) is idempotent (`ON CONFLICT` / `NOT EXISTS`) and
set-based, taking about 1 s for 5,000 Jameyas and about 69k seats. It creates:

* the 5 contract users, password `Pokunity123!` (bcrypt, cost 10), with preferences, KYC
  simulator profiles (`noura` = TIMEOUT), and `khaled` with 6 expired holds;
* `SEED_LOADTEST_USERS` (1,000) members `loadtest+N@pokunity.app`, KYC VERIFIED;
* `SEED_JAMEYAS` (5,000) Jameyas with monthly amounts from 200 to 5,000 SAR, durations of 6–24
  months, start dates over the next 4 months, and a per-Jameya fill level (about 15% full). Seat
  fees fall linearly from seat 1 to 2–4% of the payout; the last ~25% of seats are free;
* two fixed demo Jameyas (`Riyadh Savers 12M`, `Jeddah Circle 10M`) and the
  `winter-savings-2026` featured campaign (15 Jameyas, priority-ordered).
