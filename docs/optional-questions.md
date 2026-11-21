# Optional Questions

## 1. How is payment idempotency guaranteed?

Every step that can repeat has its own guard:

| Step | Guard |
|---|---|
| Client → API | `Idempotency-Key` per member (24 h). A repeat replays the stored response ([rules](api/README.md#idempotency)) |
| Checkout → payment | `payments.reservation_id` is unique: one payment per reservation, ever |
| API → provider | Our payment id is the provider's idempotency key, so retries return the same intent |
| Capture / void | One outbox command per payment (unique), with keys `capture:<id>` and `void:<id>` |
| Provider → API | Webhook `event_id` is unique; every state change is conditional |
| Ledger | Unique `(payment_id, entry_type)`: a second `CAPTURE` row cannot exist |

## 2. Is overbooking allowed?

**No.** Each seat is a specific payout month in a fixed-size group. A 12-member Jameya has exactly 12 contributions and 12 payouts, so a 13th member has no payout month and the money no longer balances. Overbooking would also mean charging someone without a seat, which the product forbids.

Instead, seats are kept in use:

- short holds (5 min), swept every 5 s;
- members who let holds expire get a lower hold limit;
- failed payments release the seat immediately;
- a waitlist would be the natural next feature.

## 3. How are inconsistencies recovered?

**Prevention:** one transaction per decision, conditional updates, database triggers and unique indexes ([database](architecture/database.md)). What remains is external: the provider, and crashes between commit and a provider call.

**Automatic recovery:**

| Problem | Found by | Fixed by |
|---|---|---|
| Webhook lost or provider slow | Payment authorizing > 2 min | Ask the provider: confirm and capture, or fail and void by 10 min |
| Authorize never reached the provider | Same scan | Unknown to the provider → fail (nothing to void) |
| Webhook before the intent is known | Orphan events | Retried every 10 s |
| Capture or void not done | Pending outbox rows | Retried with backoff |
| Late authorization | Webhook on a failed payment | Void |
| Redis counters drift | Every 10 s | Rebuilt from PostgreSQL |
| Stuck idempotency key | 60 s lease | Taken over by the next retry |

**For humans:** alerts on dead outbox rows, old orphans and long-pending payments, plus ready-made queries in the [runbook](operations/runbook.md#reconciliation-queries). The **ledger** is the financial truth: each payment has `AUTHORIZE → CAPTURE`, `AUTHORIZE → VOID`, or nothing. A daily job (recommended) would compare it with the provider's settlement report.
