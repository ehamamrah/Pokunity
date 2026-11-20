# Contract Change Requests

This log records gaps found while implementing the frontend against the frozen contract. It is
append-only. Each entry states the gap, the frontend's backward-compatible interpretation, and the
requested change. The backend team may add entries here too.

Status values: `open` (awaiting decision), `accepted` (will be added to the contract),
`interpreted` (frontend behavior is settled, no contract change needed).

## Frontend (GAP-FE)

### GAP-FE-001: No analytics surface for the reservation/checkout page
- **Status:** open
- **Gap:** `AnalyticsEvent.surface` is one of `marketplace_list`, `featured_carousel`, `jameya_detail`.
  `checkout_started` happens on `/reservations/{id}`, which fits none of these.
- **Interpretation:** `checkout_started` is sent with `surface: jameya_detail`, the nearest
  funnel stage.
- **Request:** add `checkout` (or `reservation_checkout`) to the `surface` enum. Backward compatible.

### GAP-FE-002: `experiment` is not echoed on detail or reservation responses
- **Status:** interpreted
- **Gap:** `meta.experiment` exists only on `GET /jameyas`. Detail and checkout events have no list
  context when opened from a link.
- **Interpretation:** the frontend remembers the most recent list assignment in memory and attaches it
  to detail and checkout events. Events without a prior list are sent without `experiment`.
- **Request (optional):** return `experiment` on `GET /jameyas/{id}` for deep links. Backward compatible.

### GAP-FE-003: No "similar Jameyas" endpoint for `JAMEYA_FULL`
- **Status:** interpreted
- **Gap:** `JAMEYA_FULL` says "suggest similar Jameyas", but no endpoint returns them.
- **Interpretation:** the UI links to `GET /jameyas` filtered to the same `monthlyAmount`, with
  `availableOnly=true`, which is within the contract.
- **Request (optional):** `GET /jameyas/{id}/similar`, ranked and capped at 5. Backward compatible.

### GAP-FE-004: Unbounded `PAYMENT_PENDING` with no expected resolution time
- **Status:** open
- **Gap:** `tok_timeout` resolves through reconciliation after about 10 minutes, but the reservation
  carries no hint of when a result is expected. The UI can only say "still confirming".
- **Interpretation:** the UI keeps polling at 3 s, shows a "still confirming" notice, and never
  implies a charge. Failure copy states that no charge was made.
- **Request:** add an optional `payment.resolveBy` (ISO datetime) to `PaymentSummary`, so the UI can
  state a realistic expectation. Backward compatible.

### GAP-FE-005: Payment status after a decline is not specified
- **Status:** open
- **Gap:** on `payment.failed` the contract sets the reservation to `FAILED` (`PAYMENT_DECLINED`) and
  says the authorization is voided. It does not say whether `payment.status` becomes `FAILED` or
  `VOIDED`.
- **Interpretation:** the UI does not branch on `payment.status` for failures. The copy is true for
  either value.
- **Request:** specify the `payment.status` after a decline (suggested: `VOIDED`) in the reservations
  doc.

### GAP-FE-006: `error.details` keys are not specified per code
- **Status:** open
- **Gap:** `details` is an untyped object. The frontend depends on `details.reservationId`
  (`ACTIVE_RESERVATION_EXISTS`), `details.seatNumber` (`SEAT_UNAVAILABLE`) and `details.status`
  (`INVALID_STATE`), but these appear only in examples.
- **Interpretation:** the frontend reads these keys when present and falls back to generic copy when
  absent.
- **Request:** document the `details` keys for every code in `openapi.yaml` (for example, as
  discriminated schemas), so both sides can rely on them.

### GAP-FE-007: `HOLD_LIMIT_REACHED` does not say the limit
- **Status:** open
- **Gap:** the message needs `maxActiveHolds`, which is on `/me`, not in the error.
- **Interpretation:** the message is generic ("the maximum number of seats on hold").
- **Request:** include `details.maxActiveHolds` and `details.activeHolds` on `HOLD_LIMIT_REACHED`.

### GAP-FE-008: Idempotent replay of error responses is not stated
- **Status:** open
- **Gap:** the README says a completed request's response is stored and replayed. It is not explicit
  that business errors (for example, a `409 SEAT_UNAVAILABLE`) are stored too.
- **Interpretation:** the frontend settles a key after a definitive error, so a later click always uses
  a new key. This is correct whether or not errors are replayed.
- **Request:** state explicitly whether 4xx business errors are stored and replayed.

### GAP-FE-009: No way to explain a viewer block that is not a RestrictionReason
- **Status:** open
- **Gap:** `viewer.canReserve` can be `false` for a hold limit with `blockingReason: null` and no
  `activeReservationId`. The UI cannot explain it without `/me`.
- **Interpretation:** the detail page shows a generic "You cannot reserve yet" notice when
  `blockingReason` is null.
- **Request:** extend the blocking reason set (for example, `HOLD_LIMIT`), or document that `/me`
  limits should be used for this case.

### GAP-FE-010: Logout and token revocation
- **Status:** open (noted)
- **Gap:** there is no `POST /auth/logout`. The JWT is stateless and cannot be revoked before its
  one-hour TTL.
- **Interpretation:** logout deletes the BFF cookie. A stolen token stays valid until it expires.
- **Request:** optional token denylist or a logout endpoint, for stronger session control in a
  regulated product.

### GAP-FE-011: `GET /reservations` is unbounded
- **Status:** open (low priority)
- **Gap:** the list has no pagination, so a long-lived account grows without bound.
- **Interpretation:** the UI shows the full list, which is acceptable at the current volumes.
- **Request:** add `page`/`pageSize` with the same meta shape as `GET /jameyas`.

## Backend (GAP-BE)

Interpretations chosen by the backend where the contract is silent. Each is backward compatible.

### GAP-BE-001: `tok_timeout` resolution path
- **Status:** interpreted
- **Gap:** README says reconciliation "resolves (queries provider, voids if needed)" without fixing the outcome.
- **Interpretation:** the simulator **authorizes** the intent but never sends the webhook (a lost
  webhook). Reconciliation queries the provider after 2 min and confirms + captures. The
  "no authorization after 10 min → FAILED (`PAYMENT_TIMEOUT`) + void" branch is implemented and
  covered by integration tests (`tok_slow` with an aged payment).

### GAP-BE-002: Malformed ids and out-of-range seats
- **Status:** interpreted
- **Gap:** behaviour for a non-UUID `{id}` and for `seatNumber > totalSeats` is unspecified.
- **Interpretation:** a non-UUID path id returns `404 NOT_FOUND` (the resource cannot exist); a
  seat number beyond the Jameya's seats returns `404 NOT_FOUND` ("Seat N not found"). Body fields
  that fail type validation return `400 VALIDATION_ERROR`.

### GAP-BE-003: `SEAT_UNAVAILABLE` from the single-flight gate
- **Status:** interpreted
- **Gap:** step 6 of the reservation checks names only `JAMEYA_FULL`.
- **Interpretation:** when another request is already claiming the same seat, the gate answers
  `409 SEAT_UNAVAILABLE` (`details.seatNumber`) without a DB round trip. This is the same code and
  client action as a lost DB claim.

### GAP-BE-004: Health `checks.kyc` and analytics extras
- **Status:** interpreted
- **Gap/notes:** `kyc` is `degraded` while the KYC circuit breaker is not CLOSED. `POST /events`
  accepts an empty `events` array (`{accepted: 0}`) and additionally accepts `surface: checkout`
  (lenient superset, see GAP-FE-001). Client events without `experiment` are stored unattributed.

## Backend responses to frontend gaps

| Gap | Backend behaviour today |
|---|---|
| GAP-FE-001 | `surface: "checkout"` is **accepted** by the backend (superset); `jameya_detail` keeps working. Contract update still recommended. |
| GAP-FE-002 | Not implemented. The assignment is deterministic per member, so adding `experiment` to the detail response is trivial if accepted. |
| GAP-FE-004 | Not implemented. The value would be `payment.createdAt + 10 min` (`PAYMENT_TIMEOUT_SECONDS`). Today a `tok_timeout` payment resolves after about 2 min, any stuck payment after at most 10 min. |
| GAP-FE-005 | Decline → `payment.status = FAILED` (nothing was authorized, so nothing to void). Timeout without authorization → `FAILED`. A late authorization that we void → `VOIDED`. |
| GAP-FE-006 | Keys sent today: `SEAT_UNAVAILABLE {seatNumber}`, `JAMEYA_FULL {jameyaId}`, `ACTIVE_RESERVATION_EXISTS {reservationId}`, `HOLD_LIMIT_REACHED {maxActiveHolds, activeHolds}`, `INVALID_STATE {status}`, `RISK_RESTRICTED {seatNumber, riskTier}`, `KYC_REQUIRED {kycStatus}`, `RESERVATION_EXPIRED {reservationId}`, `RATE_LIMITED {retryAfterSeconds}`, `VALIDATION_ERROR {fields: [{field, issues[]}]}`. |
| GAP-FE-007 | Already sent: `details.maxActiveHolds`, `details.activeHolds`. |
| GAP-FE-008 | Deterministic 4xx outcomes **are stored and replayed** for the same key (with `Idempotent-Replayed: true`). `429` and 5xx are not stored; the key is freed for retry. |
| GAP-FE-009 | `viewer.canReserve` is `false` only for a KYC block (`blockingReason` set), an existing active reservation in this Jameya (`activeReservationId` set), or no available unrestricted seat. The hold limit does **not** affect `canReserve`; it surfaces as `409 HOLD_LIMIT_REACHED` at reservation time. |
| GAP-FE-010 | Agreed gap. Recommendation: short-lived access tokens + rotating refresh tokens and a Redis `jti` denylist for logout. |
| GAP-FE-011 | The backend caps `GET /reservations` at the 200 most recent. Pagination is recommended as an additive change. |
