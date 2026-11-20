# Auth & Profile

## POST `/api/v1/auth/login`

Exchanges email/password for a JWT. No auth required.

**Request**
```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "sara@pokunity.app", "password": "Pokunity123!" }
```

**200 OK**
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

## GET `/api/v1/me`

Returns the viewer's profile, eligibility, and limits. The frontend uses this to decide
whether to show KYC prompts and how many holds remain.

**Request**
```http
GET /api/v1/me
Authorization: Bearer <jwt>
```

**200 OK**
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
