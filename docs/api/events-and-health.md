# Analytics Events & Health

## POST `/api/v1/events`

Analytics for the ranking A/B test (impressions, clicks, funnel steps). The client batches them: every 5 s or 20 events.

### Request

```http
POST /api/v1/events
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "events": [
    {
      "type": "impression",
      "jameyaId": "5f8a1c3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b",
      "position": 1,
      "surface": "marketplace_list",
      "experiment": { "key": "ranking_v2", "variant": "treatment" },
      "occurredAt": "2026-11-21T10:00:04.000Z"
    },
    {
      "type": "click",
      "jameyaId": "5f8a1c3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b",
      "position": 1,
      "surface": "marketplace_list",
      "experiment": { "key": "ranking_v2", "variant": "treatment" },
      "occurredAt": "2026-11-21T10:00:09.000Z"
    }
  ]
}
```

| Field | Values |
|---|---|
| `type` | `impression`, `click`, `seat_selected`, `checkout_started` |
| `surface` | `marketplace_list`, `featured_carousel`, `jameya_detail`, `checkout` |
| `position` | 1-based rank in list (null for detail) |

Up to 50 events per request. `reservation_created` and `reservation_confirmed` are recorded by the backend itself.

### 202 Accepted

```json
{ "accepted": 2 }
```

**400** `VALIDATION_ERROR` · **401** `UNAUTHORIZED`

---

## GET `/api/v1/health`

No auth. Used by Docker healthchecks.

### 200 OK

```json
{
  "status": "ok",
  "checks": { "database": "up", "redis": "up", "kyc": "degraded" },
  "time": "2026-11-21T10:00:00.000Z"
}
```

`kyc: "degraded"` (KYC breaker open) still counts as healthy. The endpoint returns `503` only when the database or Redis is down.
