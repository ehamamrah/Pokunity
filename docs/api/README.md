# API Contract (v1.1)

The agreed contract between backend and frontend. [`openapi.yaml`](openapi.yaml) is the source of truth. Change it, and the matching page below, before changing code. History: [change requests](change-requests.md).

## Endpoints

| Method | Path | Auth | Purpose | Doc |
|---|---|---|---|---|
| POST | `/auth/login` | – | Get a JWT | [auth](auth.md) |
| POST | `/auth/logout` | JWT | Revoke this session or all sessions | [auth](auth.md) |
| GET | `/me` | JWT | Profile, KYC, risk tier, limits | [auth](auth.md) |
| GET | `/jameyas` | JWT | Ranked, filtered, paginated list | [jameyas](jameyas.md) |
| GET | `/jameyas/featured` | JWT | Featured Jameyas | [jameyas](jameyas.md) |
| GET | `/jameyas/{id}` | JWT | Detail and seat map | [jameyas](jameyas.md) |
| GET | `/jameyas/{id}/similar` | JWT | Up to 5 similar open Jameyas | [jameyas](jameyas.md) |
| POST | `/reservations` | JWT + `Idempotency-Key` | Hold a seat | [reservations](reservations.md) |
| GET | `/reservations` | JWT | My reservations (paginated) | [reservations](reservations.md) |
| GET | `/reservations/{id}` | JWT | Reservation status (poll this) | [reservations](reservations.md) |
| POST | `/reservations/{id}/checkout` | JWT + `Idempotency-Key` | Start payment | [reservations](reservations.md) |
| DELETE | `/reservations/{id}` | JWT | Release my hold | [reservations](reservations.md) |
| POST | `/payments/webhook` | HMAC | Payment provider callback | [webhook](payments-webhook.md) |
| POST | `/events` | JWT | Analytics events | [events & health](events-and-health.md) |
| GET | `/health` | – | Dependency health | [events & health](events-and-health.md) |

All paths are under `/api/v1`. The browser calls the Next.js server on `:3000`, which forwards to the backend on `:4000`.

## Conventions

| Topic | Rule |
|---|---|
| Auth | `Authorization: Bearer <jwt>`, valid for 1 h |
| Money | Integer minor units (halalas): `100000` = 1,000.00 SAR, always with `currency: "SAR"` |
| Time | ISO-8601 UTC, e.g. `2026-11-21T10:00:00.000Z` |
| IDs | UUID v4 |
| Pagination | `page` (from 1), `pageSize` (default 20, max 50). Returns `meta: { page, pageSize, total, asOf }` |
| Freshness | Marketplace reads may be up to 5 s old. Booking always reads the database |
| Tracing | Send `X-Request-Id` if you like. Every response returns one, and errors repeat it as `traceId` |
| Rate limits | Responses carry `RateLimit-Limit`, `-Remaining`, `-Reset`. A `429` adds `Retry-After`. [Limits per endpoint](../performance/backend.md#rate-limits) |

## Caching (ETag)

Reads return an `ETag` and an `X-As-Of` header. Send `If-None-Match: <etag>` and, if nothing you would see has changed, get `304 Not Modified` with no body.

| Endpoint | `Cache-Control` | ETag ignores |
|---|---|---|
| `/jameyas`, `/featured`, `/similar` | `private, max-age=5` | `asOf` |
| `/jameyas/{id}` | `private, no-cache` | `asOf` |
| `/me` | `private, no-cache` | `kycCheckedAt` |
| `/reservations`, `/reservations/{id}` | `private, no-cache` | nothing (always read live) |

- The ETag changes only when visible content changes, not when a timestamp refreshes.
- `X-As-Of` comes on both 200 and 304. Use it for "updated Xs ago".
- ETags are weak (`W/"…"`). How it works: [caching](../performance/caching.md).

## Idempotency

`POST /reservations` and `POST /reservations/{id}/checkout` need an `Idempotency-Key` header (UUID v4). Make one per user action and reuse it on retries.

| Situation | Result |
|---|---|
| New key | Processed; response kept 24 h per user |
| Same key and body, finished | Same response replayed, with `Idempotent-Replayed: true` |
| Same key and body, still running | `409 IDEMPOTENCY_IN_PROGRESS`; retry shortly |
| Same key, different body | `422 IDEMPOTENCY_KEY_REUSED` |
| No key | `400 VALIDATION_ERROR` |
| Ended in a 4xx (not 429) | Stored and replayed; use a **new** key to try again |
| Ended in 429 or 5xx | Not stored; retry with the **same** key |

## Errors

Every error has this shape. `traceId` is never empty.

```json
{
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "Seat 3 is no longer available.",
    "details": { "seatNumber": 3 },
    "traceId": "8c1f6a0e-3a51-4c4e-9a43-2b1c9d1f7e10"
  }
}
```

| HTTP | `code` | `details` | What the client should do |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `fields[]` | Fix the input |
| 401 | `UNAUTHORIZED` | – | Token missing, expired or revoked: go to login |
| 401 | `INVALID_CREDENTIALS` | – | Wrong email or password |
| 401 | `INVALID_SIGNATURE` | – | Webhook signature mismatch |
| 403 | `KYC_REQUIRED` | `kycStatus` | Show the KYC prompt |
| 403 | `RISK_RESTRICTED` | `seatNumber`, `riskTier` | Suggest another seat |
| 403 | `FORBIDDEN` | – | Not your resource |
| 404 | `NOT_FOUND` | – | Unknown id, non-UUID id, or seat number out of range |
| 409 | `SEAT_UNAVAILABLE` | `seatNumber` | Seat taken or being claimed: refresh the seat map |
| 409 | `JAMEYA_FULL` | `jameyaId` | Show `/jameyas/{id}/similar` |
| 409 | `ACTIVE_RESERVATION_EXISTS` | `reservationId` | Link to the existing hold |
| 409 | `HOLD_LIMIT_REACHED` | `maxActiveHolds`, `activeHolds` | Explain the limit |
| 409 | `INVALID_STATE` | `status` | Action not allowed in this status |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | – | Retry shortly |
| 410 | `RESERVATION_EXPIRED` | `reservationId` | Offer to reserve again |
| 422 | `IDEMPOTENCY_KEY_REUSED` | – | Use a new key |
| 429 | `RATE_LIMITED` | `retryAfterSeconds` | Wait for `Retry-After` |
| 500 | `INTERNAL_ERROR` | – | Unexpected |
| 503 | `KYC_UNAVAILABLE` | – | KYC down, nothing cached: "try again shortly" |
| 503 | `SERVICE_UNAVAILABLE` | – | Backend unreachable (from the BFF), or session can't be verified on reserve/checkout. Wait for `Retry-After` |
| 504 | `UPSTREAM_TIMEOUT` | – | BFF waited 10 s. Retry; writes with the same key |

## Enums

| Enum | Values |
|---|---|
| `KycStatus` | `VERIFIED`, `PENDING`, `REJECTED`, `UNKNOWN` |
| `RiskTier` | `LOW`, `MEDIUM`, `HIGH` |
| `SeatStatus` | `AVAILABLE`, `HELD`, `TAKEN` |
| `ReservationStatus` | `HELD`, `PAYMENT_PENDING`, then one of `CONFIRMED`, `EXPIRED`, `CANCELLED`, `FAILED` (final) |
| `PaymentStatus` | `AUTHORIZING`, `AUTHORIZED`, `CAPTURED`, `VOIDED`, `FAILED` |
| `JameyaBadge` | `FEATURED`, `ALMOST_FULL`, `STARTING_SOON`, `NEW`, `BEST_MATCH` |
| `RestrictionReason` | `KYC_REQUIRED`, `RISK_TIER`, `KYC_UNAVAILABLE` |
| `BlockingReason` | any `RestrictionReason`, or `HOLD_LIMIT` |

## Demo users

Password for all: `Pokunity123!`

| Email | KYC | Risk | Shows |
|---|---|---|---|
| `sara@pokunity.app` | VERIFIED | LOW | Happy path |
| `omar@pokunity.app` | PENDING | LOW | Reserve fails with `KYC_REQUIRED` |
| `lina@pokunity.app` | VERIFIED | HIGH | Early seats restricted (`RISK_TIER`) |
| `khaled@pokunity.app` | VERIFIED | MEDIUM | Many expired holds: hold limit 1 |
| `noura@pokunity.app` | VERIFIED | LOW | KYC always times out: cache or `KYC_UNAVAILABLE` |

## Payment test tokens

| `paymentMethodToken` | What happens |
|---|---|
| `tok_success` | Authorized after ~1 s: seat `CONFIRMED`, payment `CAPTURED` |
| `tok_decline` | Declined: reservation `FAILED`, seat released |
| `tok_slow` | Authorized after ~8 s (keep polling) |
| `tok_duplicate` | Webhook sent 3 times: confirmed once, captured once |
| `tok_timeout` | No webhook: the reconciliation job settles it |
