# Pokunity API Contract (v1.1)

> **Status:** Agreed contract between Backend and Frontend. Source of truth: [`openapi.yaml`](openapi.yaml).
> Any change requires updating both `openapi.yaml` and the relevant endpoint doc below **before** implementation.
> **v1.1** (additive): logout, similar Jameyas, reservation pagination, stable ETags + `X-As-Of`,
> resolved [change requests](change-requests.md).

## Endpoint index

| Method | Path | Auth | Purpose | Doc |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | – | Exchange credentials for JWT | [auth.md](auth.md) |
| POST | `/api/v1/auth/logout` | JWT | Revoke this session (or all sessions) | [auth.md](auth.md) |
| GET | `/api/v1/me` | JWT | Current user, KYC, risk tier, limits | [auth.md](auth.md) |
| GET | `/api/v1/jameyas` | JWT | Ranked, filtered, paginated marketplace | [jameyas.md](jameyas.md) |
| GET | `/api/v1/jameyas/featured` | JWT | Marketing-featured Jameyas | [jameyas.md](jameyas.md) |
| GET | `/api/v1/jameyas/{id}` | JWT | Jameya detail + seat map for viewer | [jameyas.md](jameyas.md) |
| GET | `/api/v1/jameyas/{id}/similar` | JWT | Up to 5 similar open Jameyas | [jameyas.md](jameyas.md) |
| POST | `/api/v1/reservations` | JWT + Idempotency-Key | Place a temporary hold on a seat | [reservations.md](reservations.md) |
| GET | `/api/v1/reservations` | JWT | List my reservations (paginated) | [reservations.md](reservations.md) |
| GET | `/api/v1/reservations/{id}` | JWT | Reservation status (poll target) | [reservations.md](reservations.md) |
| POST | `/api/v1/reservations/{id}/checkout` | JWT + Idempotency-Key | Start payment authorization | [reservations.md](reservations.md) |
| DELETE | `/api/v1/reservations/{id}` | JWT | Release my hold | [reservations.md](reservations.md) |
| POST | `/api/v1/payments/webhook` | HMAC signature | Payment provider callback | [payments-webhook.md](payments-webhook.md) |
| POST | `/api/v1/events` | JWT | Marketplace analytics events (A/B) | [events-and-health.md](events-and-health.md) |
| GET | `/api/v1/health` | – | Liveness / dependency health | [events-and-health.md](events-and-health.md) |

## Conventions

| Topic | Rule |
|---|---|
| Base URL | Browser calls `http://localhost:3000/api/v1/*` (Next.js rewrites to `http://backend:4000/api/v1/*`). Backend is also exposed on `http://localhost:4000`. |
| Auth | `Authorization: Bearer <jwt>`; token TTL 1h. |
| Money | Integer **minor units** (halalas). `100000` = 1,000.00 SAR. Always paired with `currency: "SAR"`. |
| Time | ISO-8601 UTC strings, e.g. `2026-11-21T10:00:00.000Z`. |
| IDs | UUID v4 strings. |
| Tracing | Client may send `X-Request-Id`; server always returns one and includes it as `error.traceId`. |
| Freshness | Marketplace data may be up to **5 s** stale. Responses carry `asOf` timestamps. The booking path (`POST /reservations`, `checkout`) always reads the authoritative database. |
| Pagination | `page` (1-based) + `pageSize` (default 20, max 50). Response `meta: { page, pageSize, total, asOf }`. |

## Conditional requests (ETag) and freshness

Cacheable reads return a **stable ETag** and an `X-As-Of` header:

| Endpoint | `Cache-Control` | ETag computed from |
|---|---|---|
| `GET /jameyas`, `/jameyas/featured`, `/jameyas/{id}/similar` | `private, max-age=5` | Response body **without** volatile fields (`asOf`) |
| `GET /jameyas/{id}` | `private, no-cache` | Body without `asOf` |
| `GET /me` | `private, no-cache` | Body without `kycCheckedAt` |
| `GET /reservations`, `GET /reservations/{id}` | `private, no-cache` | Full body (authoritative, never served from cache) |

- Send `If-None-Match: <etag>`; if the content is unchanged the server answers **`304 Not Modified`** with no body.
- The ETag changes **only when the content the user sees changes** (seat counts, statuses, prices, ranking order…), not when a timestamp is refreshed.
- `X-As-Of` (ISO datetime) is sent on **both 200 and 304**: the moment the server last verified the data. Clients use it for "updated Xs ago" so a 304 still refreshes the freshness indicator. Body `asOf` fields remain for compatibility.
- ETags are weak (`W/"…"`): semantically equal, not byte-equal (compression may differ).

## Rate-limit headers

Rate-limited endpoints return `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds); a `429` adds `Retry-After`. Limits per endpoint: [performance/backend.md](../performance/backend.md#6-rate-limiting).

## Idempotency

`POST /reservations` and `POST /reservations/{id}/checkout` **require** an `Idempotency-Key` header (UUID v4), generated once per user intent (e.g. per click, reused on retries).

| Situation | Result |
|---|---|
| New key | Request processed; response stored for 24h, scoped per user. |
| Same key + same body, completed | Stored response replayed, header `Idempotent-Replayed: true`. |
| Same key + same body, still in flight | `409 IDEMPOTENCY_IN_PROGRESS` – retry after a short delay. |
| Same key + different body | `422 IDEMPOTENCY_KEY_REUSED`. |
| Missing key | `400 VALIDATION_ERROR`. |
| Completed with a business error (4xx except 429) | Stored and replayed like a success (e.g. a replayed `409 SEAT_UNAVAILABLE`). Use a **new** key for a new attempt. |
| `429` or 5xx | Not stored; the key is released, so retrying with the same key is safe. |

## Error envelope

Every non-2xx response:

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

| HTTP | `code` | `details` keys | Meaning / client action |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `fields: [{ field, issues[] }]` | Bad input. |
| 401 | `UNAUTHORIZED` | – | Missing, expired or **revoked** JWT → redirect to login. |
| 401 | `INVALID_CREDENTIALS` | – | Wrong email/password. |
| 401 | `INVALID_SIGNATURE` | – | Webhook signature mismatch. |
| 403 | `KYC_REQUIRED` | `kycStatus` | User KYC not verified → show KYC prompt. |
| 403 | `RISK_RESTRICTED` | `seatNumber`, `riskTier` | Seat restricted for user's risk tier → suggest other seats. |
| 403 | `FORBIDDEN` | – | Resource belongs to another user. |
| 404 | `NOT_FOUND` | – | Unknown resource. Also returned for a non-UUID id or a seat number beyond the Jameya's seats. |
| 409 | `SEAT_UNAVAILABLE` | `seatNumber` | Seat held/taken by someone else (or being claimed right now) → refresh seat map. |
| 409 | `JAMEYA_FULL` | `jameyaId` | No seats left (fast-fail gate) → show [`/jameyas/{id}/similar`](jameyas.md). |
| 409 | `ACTIVE_RESERVATION_EXISTS` | `reservationId` | User already has an active hold in this Jameya → link to it. |
| 409 | `HOLD_LIMIT_REACHED` | `maxActiveHolds`, `activeHolds` | User has the maximum number of active holds. |
| 409 | `INVALID_STATE` | `status` | Transition not allowed (e.g. checkout on CONFIRMED). |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | – | See Idempotency. |
| 410 | `RESERVATION_EXPIRED` | `reservationId` | Hold expired before checkout → let user re-reserve. |
| 422 | `IDEMPOTENCY_KEY_REUSED` | – | See Idempotency. |
| 429 | `RATE_LIMITED` | `retryAfterSeconds` | Honor `Retry-After` header (seconds). |
| 500 | `INTERNAL_ERROR` | – | Unexpected. |
| 503 | `KYC_UNAVAILABLE` | – | KYC service down and no cached status → "try again shortly". Browsing still works. |
| 503 | `SERVICE_UNAVAILABLE` | – | *BFF-generated:* backend unreachable or circuit open. Honor `Retry-After`. |
| 504 | `UPSTREAM_TIMEOUT` | – | *BFF-generated:* backend did not answer within 10 s. Safe to retry reads; retry writes with the **same** Idempotency-Key. |

Every error, including validation errors raised before a handler runs, carries a non-empty `traceId` (equal to the `X-Request-Id` response header).

## Shared enums

| Enum | Values |
|---|---|
| `KycStatus` | `VERIFIED`, `PENDING`, `REJECTED`, `UNKNOWN` (service unavailable, no cache) |
| `RiskTier` | `LOW`, `MEDIUM`, `HIGH` |
| `SeatStatus` | `AVAILABLE`, `HELD`, `TAKEN` |
| `ReservationStatus` | `HELD`, `PAYMENT_PENDING`, `CONFIRMED`, `EXPIRED`, `CANCELLED`, `FAILED` |
| `PaymentStatus` | `AUTHORIZING`, `AUTHORIZED`, `CAPTURED`, `VOIDED`, `FAILED` |
| `JameyaBadge` | `FEATURED`, `ALMOST_FULL`, `STARTING_SOON`, `NEW`, `BEST_MATCH` |
| `RestrictionReason` | `KYC_REQUIRED`, `RISK_TIER`, `KYC_UNAVAILABLE` |
| `BlockingReason` (`viewer.blockingReason`) | any `RestrictionReason`, plus `HOLD_LIMIT` (v1.1) |

Terminal reservation statuses: `CONFIRMED`, `EXPIRED`, `CANCELLED`, `FAILED`.

## Seeded demo users (password for all: `Pokunity123!`)

| Email | KYC | Risk | Demonstrates |
|---|---|---|---|
| `sara@pokunity.app` | VERIFIED | LOW | Happy path, all seats visible |
| `omar@pokunity.app` | PENDING | LOW | Browse only; reserve → `KYC_REQUIRED` |
| `lina@pokunity.app` | VERIFIED | HIGH | Early seats restricted (`RISK_TIER`) |
| `khaled@pokunity.app` | VERIFIED | MEDIUM | Past behavior: many expired holds → hold limit 1 |
| `noura@pokunity.app` | VERIFIED | LOW | KYC lookup always times out → served from cache / `KYC_UNAVAILABLE` |

## Payment test tokens (simulated provider)

| `paymentMethodToken` | Behavior |
|---|---|
| `tok_success` | Authorized after ~1s → seat CONFIRMED, payment CAPTURED |
| `tok_decline` | `payment.failed` (`INSUFFICIENT_FUNDS`) → reservation FAILED, seat released |
| `tok_slow` | Authorized after ~8s (UI must keep polling) |
| `tok_duplicate` | Same `payment.authorized` callback delivered 3× (must confirm once, capture once) |
| `tok_timeout` | No callback ever → reconciliation job resolves (queries provider, voids if needed) |
