# Auth & Profile

## POST `/api/v1/auth/login`

Exchanges email/password for a JWT. No auth required.

### Request

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "sara@pokunity.app", "password": "Pokunity123!" }
```

### 200 OK

```json
{
  "accessToken": "<jwt>",
  "expiresIn": 3600,
  "user": {
    "id": "0b7d2f1e-6f52-4c38-9a8e-3f1a2b4c5d6e",
    "name": "Sara Al-Qahtani",
    "email": "sara@pokunity.app"
  }
}
```

**401** `INVALID_CREDENTIALS` · **400** `VALIDATION_ERROR` · **429** `RATE_LIMITED` (5 attempts / min / IP)

---

## POST `/api/v1/auth/logout` (v1.1)

Revokes the caller's session. Every access token carries a unique `jti`; logout puts it on a
**denylist** (Redis, TTL = the token's remaining lifetime), so the token is rejected with
`401 UNAUTHORIZED` from then on — even if it was copied elsewhere.

### Request

```http
POST /api/v1/auth/logout
Authorization: Bearer <jwt>
Content-Type: application/json

{ "allSessions": false }
```

| Field | Type | Default | Meaning |
|---|---|---|---|
| `allSessions` | bool | `false` | `true` revokes **every** token of this member (all devices) by bumping the member's token version. |

The body is optional (`{}` or no body = this session only).

**204 No Content** — always, also when the token was already revoked (idempotent).

**401** `UNAUTHORIZED` (no/invalid token) · **429** `RATE_LIMITED`

### Notes

- Revocation is checked on every authenticated request. If the denylist store is unavailable, the
  server still enforces the member's token version (`allSessions` logouts) from PostgreSQL and
  fails **closed** for tokens it cannot verify only on money-moving endpoints (reserve, checkout).
- The BFF calls this endpoint, then deletes its httpOnly session cookie.

---

## GET `/api/v1/me`

Returns the viewer's profile, eligibility, and limits. The frontend uses this to decide
whether to show KYC prompts and how many holds remain.

### Request

```http
GET /api/v1/me
Authorization: Bearer <jwt>
```

### 200 OK

```json
{
  "id": "0b7d2f1e-6f52-4c38-9a8e-3f1a2b4c5d6e",
  "name": "Sara Al-Qahtani",
  "email": "sara@pokunity.app",
  "kycStatus": "VERIFIED",
  "kycCheckedAt": "2026-11-21T09:58:12.000Z",
  "riskTier": "LOW",
  "preferences": { "typicalMonthlyAmount": 100000, "preferredDurations": [10, 12] },
  "limits": { "maxActiveHolds": 3, "activeHolds": 1 }
}
```

- `kycStatus: "UNKNOWN"` means the KYC service is unavailable and no cached result exists.
  Browsing works; reserving returns `503 KYC_UNAVAILABLE`.
- `kycCheckedAt` is when the KYC status was last confirmed (may be served from cache).

**401** `UNAUTHORIZED`
