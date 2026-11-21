# Auth & Profile

## POST `/api/v1/auth/login`

Swaps email and password for a JWT (valid 1 h).

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

Revokes the current session, or every session of the member. A revoked token gets `401 UNAUTHORIZED` from then on, even if it was copied elsewhere. Design: [ADR-0012](../architecture/adr/0012-token-revocation.md).

### Request

```http
POST /api/v1/auth/logout
Authorization: Bearer <jwt>
Content-Type: application/json

{ "allSessions": false }
```

`allSessions: true` logs out every device. The body is optional; without it only this session is revoked.

**204 No Content**, also when the token was already revoked.

**401** `UNAUTHORIZED` (no/invalid token) · **429** `RATE_LIMITED`

If Redis is down, browsing keeps working, but reserve and checkout return `503 SERVICE_UNAVAILABLE` rather than accept a token that might be revoked.

---

## GET `/api/v1/me`

The viewer's profile, KYC status and hold limits.

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

- `kycStatus: "UNKNOWN"`: KYC service down and nothing cached. Browsing works; reserving returns `503 KYC_UNAVAILABLE`.
- `kycCheckedAt`: when KYC was last confirmed (may come from cache).

**401** `UNAUTHORIZED`
