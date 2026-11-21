# Reservation and Payment Edge Cases

Every case below has an automated test unless noted. **IT** = integration test (real PostgreSQL and Redis), **UT** = unit test, **LT** = 1,000-user load test.

## Booking

| # | Case | How it's handled | Proof |
|---|---|---|---|
| 1 | Double click on Reserve | Same `Idempotency-Key` replays the first response. A unique index allows one active hold per member and Jameya anyway | IT |
| 2 | Many members, one seat | Conditional `UPDATE ... WHERE status='AVAILABLE'`, one winner. A unique index is the backup; a Redis lock keeps losers off the database | IT, LT (0 double bookings) |
| 3 | One member racing the hold limit | Limit re-checked under a per-member database lock | IT |
| 4 | Hoarding (letting holds expire) | 3+ expired holds → limit drops to 1 active hold; rate limit 5 per 10 s | UT, IT |
| 5 | List shows a seat that's gone | List may be 5 s old; booking always reads the database and returns `409` | LT |
| 6 | Price changes during a hold | Fee is copied at hold time. A webhook with a different amount is never captured | Code review |
| 7 | Zero-fee seat | Confirmed directly at checkout, no payment | IT |
| 8 | Cancel during payment, or twice | Only `HELD` can be cancelled; a second cancel returns the same `200` | IT |

## Payment

| # | Case | How it's handled | Proof |
|---|---|---|---|
| 9 | Hold expires while paying | Checkout requires `expires_at > now()`. Once `PAYMENT_PENDING`, the sweeper and a trigger make expiry impossible | IT |
| 10 | Duplicate webhooks | Unique event id; one outbox row and one ledger `CAPTURE` per payment | IT |
| 11 | Webhooks out of order | Events that don't fit the current state are recorded and ignored | IT |
| 12 | Webhook before we know the intent | Stored as an orphan, answered `200`, retried every 10 s | IT |
| 13 | Authorization after we timed out | Voided, never captured; reservation stays `FAILED` | IT |
| 14 | Capture call fails | Outbox retries with backoff (up to 12 times), then alerts. Seat stays `CONFIRMED` | Observed; [runbook](../operations/runbook.md) |
| 15 | Provider down at checkout | Payment row saved first; reconciliation looks it up later and settles it within 10 min | IT |
| 16 | Forged webhook | HMAC-SHA256 on the raw body → `401` | IT, UT |

## Failures and recovery

| # | Case | How it's handled | Proof |
|---|---|---|---|
| 17 | Client retries or times out | Idempotency keys (24 h); one payment per reservation | IT, UT |
| 18 | App crashes mid-request | Transactions roll back; stuck idempotency keys free after 60 s; outbox leases return work | UT |
| 19 | KYC slow or down | 1.5 s timeout, circuit breaker, cache. Booking fails closed (`503`); browsing works | UT |
| 20 | Redis down | Redis is never the source of truth. Gate and rate limiter fail open; PostgreSQL decides | Code review |
| 21 | Buggy code tries an illegal transition | Database triggers reject it; ledger and audit are append-only | IT |

## Sessions and caching

| # | Case | How it's handled | Proof |
|---|---|---|---|
| 22 | Token reused after logout | Token id on a Redis denylist; "all sessions" bumps a version stored in PostgreSQL | IT |
| 23 | Logout sent twice | Always `204` | IT |
| 24 | Redis down: can't check the denylist | Reads continue; reserve and checkout return `503`. Nobody is logged out | IT |
| 25 | Redis down during logout | Upgraded to "all sessions" (safe: revokes more, not less) | IT |
| 26 | "Log out everywhere" across instances | Takes effect within 5 s on other instances | [ADR-0012](../architecture/adr/0012-token-revocation.md) |
| 27 | `304` hiding a real seat change | ETag is computed from the visible content, and the seat-map cache is cleared on every change | IT |
| 28 | `/similar` for a brand-new Jameya | Read directly from the database until the next snapshot | IT |

Frontend edge cases: [frontend/edge-cases.md](../frontend/edge-cases.md).
