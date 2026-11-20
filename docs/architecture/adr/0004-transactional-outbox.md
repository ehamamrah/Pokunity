# ADR-0004: Transactional outbox for capture/void

**Status:** Accepted

## Context
The decision "capture" or "void" depends on seat state and must be durable the moment that state
commits. Calling the provider inside the transaction couples DB locks to network latency.
Calling it after commit can be lost if the process crashes.

## Decision
`payment_outbox` rows (`CAPTURE` | `VOID`, at most one per payment) are inserted in the same
transaction as the seat decision. A relay (`OutboxProcessorJob`, every 1 s):
1. claims due rows with `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`, pushing
   `next_attempt_at` 30 s ahead as a **lease**;
2. calls the provider with an idempotency key (`capture:<paymentId>`);
3. in one transaction, transitions the payment, appends the ledger entry, and marks the row `DONE`;
4. on failure schedules a retry after `2^attempts` s (max 5 min); after 12 attempts → `DEAD`
   (alert, see the [runbook](../../operations/runbook.md)).

## Consequences
* At-least-once execution with idempotent provider calls gives an effectively-once result. The
  ledger's `UNIQUE (payment_id, entry_type)` prevents double booking of money even under replays.
* Several instances can relay concurrently without coordination (SKIP LOCKED + lease).
* Capture happens about 1 s after confirmation, which is acceptable.

## Alternatives considered
* **BullMQ queue.** A second durable store that must be kept consistent with PostgreSQL (dual write).
* **CDC (Debezium) on the outbox.** A good scale-up path, but too heavy for this scope.
