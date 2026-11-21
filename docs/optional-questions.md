# Optional Questions

## 1. How do you guarantee payment idempotency?

At every hop that can repeat:

| Hop | Mechanism |
|---|---|
| Client → API (`POST /reservations`, `checkout`) | Required `Idempotency-Key` (UUID v4), scoped per member, 24 h. Same key and same request (method + path + canonical body hash) replays the stored response with `Idempotent-Replayed: true`. A key still in flight gives `409 IDEMPOTENCY_IN_PROGRESS`. Same key with a different body gives `422`. Deterministic 4xx outcomes are stored and replayed; transient 5xx/429 free the key for a retry. An abandoned in-flight key is taken over after a 60 s lease. |
| Checkout → payment | `payments.reservation_id UNIQUE`: one payment per reservation, ever. A second checkout on a `PAYMENT_PENDING` reservation is `409 INVALID_STATE`. |
| API → provider (authorize) | Our payment id is the provider reference/idempotency key; the simulator (like real PSPs) returns the existing intent on retries. |
| API → provider (capture/void) | Outbox command per payment (`UNIQUE(payment_id)`), keys `capture:<paymentId>` / `void:<paymentId>`; the provider treats a repeated capture of a captured intent as success. |
| Provider → API (webhooks) | `payment_events.event_id` PK + `ON CONFLICT DO NOTHING`; every transition is conditional on the source state, so even distinct events carrying the same fact are no-ops. |
| Money record | `ledger_entries UNIQUE(payment_id, entry_type)`, append-only: a second `CAPTURE` cannot be written. |

## 2. Do you allow overbooking?

**No.** Overbooking (selling more seats than exist, as airlines do) does not fit a Jameya. Every
seat is a specific payout month in a fixed-size rotating group. A Jameya with 12 members has
exactly 12 contributions and 12 payouts, so an extra member has no payout month and the group's
cash flow would not balance. Overbooking would also mean charging someone without a guaranteed
seat, which the product forbids, and it would create regulatory exposure for collecting funds
without an allocation.

Instead we maximise utilisation without overselling:

* short holds (5 min) and a 5 s sweeper return abandoned seats quickly;
* behavioural penalties for members who let holds expire (hold limit 1);
* authorize/capture means failed payments release seats immediately (no refund wait);
* a waitlist is a natural next feature: when a seat is released, notify the next member
  (it is not part of this contract).

## 3. How do you recover from inconsistencies?

**Prevention first:** single-transaction state changes, conditional transitions, DB triggers and
unique indexes (see [database](architecture/database.md)). The remaining sources of divergence are
external: the provider and our own crashes between commit and side effect.

**Automatic recovery:**

| Divergence | Detector | Resolution |
|---|---|---|
| Webhook lost / provider slow | Reconciliation: `AUTHORIZING` > 2 min | Query the intent: authorized → confirm + capture; failed → fail; pending > 10 min or unknown → fail + void |
| Authorize call never reached the provider (crash/timeout) | Same scan; lookup by our reference | Unknown to the provider → fail at 2 min (nothing to void) |
| Event before intent known (orphan) | `payment_events.outcome='ORPHAN'` | Retried every 10 s; applied once the payment row has the intent |
| Capture/void not executed (crash, provider error) | `payment_outbox` `PENDING` with `next_attempt_at` | Relay retries with backoff; leases recover crashed workers |
| Late authorization after failure | Webhook on `FAILED` payment | Ledger `AUTHORIZE` + VOID |
| Redis counters drift | Gate rebuild every 10 s | Recomputed from `seats` |
| Stuck idempotency key | Lease expiry (60 s) | Taken over by the next retry |

**Detection for humans:** `outbox DEAD`, orphans older than 1 h, `AUTHORIZING` older than 15 min, and
ledger-vs-state reconciliation queries ([runbook](operations/runbook.md#reconciliation-queries)).
The **ledger** is the financial truth: for every payment the expected entries are
`AUTHORIZE → CAPTURE` (confirmed) or `AUTHORIZE → VOID` (late/failed) or none (declined). A
daily job (recommended) compares the ledger with the provider's settlement report and with
reservation states, and opens an incident for any mismatch. The **audit log** (append-only, with
request ids) reconstructs who did what and when.
