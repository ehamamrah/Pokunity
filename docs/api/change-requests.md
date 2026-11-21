# Contract Change Requests

Gaps found while building against contract v1.0. **All are resolved in v1.1**, and every change was additive (no breaking changes). New gaps go at the bottom as `open`, and the contract is updated before the code.

| # | Gap | Resolution in v1.1 | Where |
|---|---|---|---|
| FE-001 | No analytics surface for checkout | `surface: checkout` added | [events](events-and-health.md) |
| FE-002 | A/B variant only on the list | `experiment` also on detail and `/similar` | [jameyas](jameyas.md) |
| FE-003 | `JAMEYA_FULL` had nothing to suggest | `GET /jameyas/{id}/similar` (up to 5) | [jameyas](jameyas.md) |
| FE-004 | No hint of when a pending payment resolves | `payment.resolveBy` | [reservations](reservations.md) |
| FE-005 | Payment status after a decline unclear | Decline → `FAILED`; late authorization voided → `VOIDED` | [reservations](reservations.md) |
| FE-006 | `error.details` keys undocumented | Keys listed per error code | [errors](README.md#errors) |
| FE-007 | `HOLD_LIMIT_REACHED` didn't say the limit | Sends `maxActiveHolds`, `activeHolds` | [errors](README.md#errors) |
| FE-008 | Unclear whether errors are replayed | 4xx stored and replayed; 429/5xx not | [idempotency](README.md#idempotency) |
| FE-009 | Hold limit couldn't be explained on detail | `blockingReason: HOLD_LIMIT` | [jameyas](jameyas.md) |
| FE-010 | No logout; tokens couldn't be revoked | `POST /auth/logout` (one or all sessions) | [auth](auth.md) |
| FE-011 | `GET /reservations` unbounded | Paginated like `/jameyas` | [reservations](reservations.md) |
| FE-012 | BFF timeouts not in the contract | `503 SERVICE_UNAVAILABLE`, `504 UPSTREAM_TIMEOUT` | [errors](README.md#errors) |
| FE-013 | ETags changed on every read | ETag ignores timestamps; `X-As-Of` header | [caching](README.md#caching-etag) |
| BE-001 | `tok_timeout` outcome unspecified | Reconciliation confirms after 2 min, or fails and voids after 10 min | [webhook](payments-webhook.md) |
| BE-002 | Malformed ids, out-of-range seats | `404 NOT_FOUND` | [errors](README.md#errors) |
| BE-003 | Single-flight gate's error unnamed | `409 SEAT_UNAVAILABLE` | [errors](README.md#errors) |
| BE-004 | Health KYC check, empty event batch | `kyc: degraded` while its breaker is open; empty batch → `{accepted: 0}` | [events & health](events-and-health.md) |
| Bug | Empty `traceId` on malformed JSON | Every error has a non-empty `traceId` | [errors](README.md#errors) |
