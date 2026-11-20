# Pokunity API Contract (v1)

> **Status:** Agreed contract between Backend and Frontend. Source of truth: [`openapi.yaml`](openapi.yaml).
> Any change requires updating both `openapi.yaml` and the relevant endpoint doc below **before** implementation.

## Endpoint index

| Method | Path | Auth | Purpose | Doc |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | – | Exchange credentials for JWT | [auth.md](auth.md) |
| GET | `/api/v1/me` | JWT | Current user, KYC, risk tier, limits | [auth.md](auth.md) |
| GET | `/api/v1/jameyas` | JWT | Ranked, filtered, paginated marketplace | [jameyas.md](jameyas.md) |
| GET | `/api/v1/jameyas/featured` | JWT | Marketing-featured Jameyas | [jameyas.md](jameyas.md) |
| GET | `/api/v1/jameyas/{id}` | JWT | Jameya detail + seat map for viewer | [jameyas.md](jameyas.md) |
| POST | `/api/v1/reservations` | JWT + Idempotency-Key | Place a temporary hold on a seat | [reservations.md](reservations.md) |
| GET | `/api/v1/reservations` | JWT | List my reservations | [reservations.md](reservations.md) |
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

## Idempotency

`POST /reservations` and `POST /reservations/{id}/checkout` **require** an `Idempotency-Key` header (UUID v4), generated once per user intent (e.g. per click, reused on retries).

| Situation | Result |
|---|---|
| New key | Request processed; response stored for 24h, scoped per user. |
| Same key + same body, completed | Stored response replayed, header `Idempotent-Replayed: true`. |
| Same key + same body, still in flight | `409 IDEMPOTENCY_IN_PROGRESS` – retry after a short delay. |
| Same key + different body | `422 IDEMPOTENCY_KEY_REUSED`. |
| Missing key | `400 VALIDATION_ERROR`. |

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

| HTTP | `code` | Meaning / client action |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad input. `details.fields` lists problems. |
| 401 | `UNAUTHORIZED` | Missing/expired JWT → redirect to login. |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password. |
| 401 | `INVALID_SIGNATURE` | Webhook signature mismatch. |
| 403 | `KYC_REQUIRED` | User KYC not verified → show KYC prompt. |
| 403 | `RISK_RESTRICTED` | Seat restricted for user's risk tier → suggest other seats. |
| 403 | `FORBIDDEN` | Resource belongs to another user. |
| 404 | `NOT_FOUND` | Unknown resource. |
| 409 | `SEAT_UNAVAILABLE` | Seat held/taken by someone else → refresh seat map. |
| 409 | `JAMEYA_FULL` | No seats left (fast-fail gate) → suggest similar Jameyas. |
| 409 | `ACTIVE_RESERVATION_EXISTS` | User already has an active hold in this Jameya. `details.reservationId` given. |
| 409 | `HOLD_LIMIT_REACHED` | User has max active holds (3). |
| 409 | `INVALID_STATE` | Transition not allowed (e.g. checkout on CONFIRMED). `details.status` given. |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | See Idempotency. |
| 410 | `RESERVATION_EXPIRED` | Hold expired before checkout → let user re-reserve. |
| 422 | `IDEMPOTENCY_KEY_REUSED` | See Idempotency. |
| 429 | `RATE_LIMITED` | Honor `Retry-After` header (seconds). |
| 503 | `KYC_UNAVAILABLE` | KYC service down and no cached status → "try again shortly". Browsing still works. |
| 500 | `INTERNAL_ERROR` | Unexpected. |

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
