# Jameyas (Marketplace)

Marketplace reads tolerate **≤5 s staleness**. Each response carries `asOf` so the UI can
show freshness and decide when to refetch. Responses send `Cache-Control: private, max-age=5`.

## Object: `JameyaSummary`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | string | e.g. "Riyadh Savers 12M" |
| `monthlyAmount` | int (minor) | Contribution per month |
| `currency` | `"SAR"` | |
| `durationMonths` | int | Equals `totalSeats` |
| `totalSeats` | int | |
| `seatsAvailable` | int | Snapshot (≤5 s stale) |
| `payoutAmount` | int (minor) | `monthlyAmount × durationMonths` |
| `minFee` / `maxFee` | int (minor) | Cheapest / most expensive seat fee |
| `startDate` | ISO date | First contribution month |
| `featured` | bool | Marketing configuration |
| `badges` | `JameyaBadge[]` | Urgency/recommendation signals |
| `ranking` | `{ score: number, reasons: string[] }` | Human-readable reasons, e.g. "Matches your usual monthly amount" |
| `asOf` | ISO datetime | Availability snapshot time |

---

## GET `/api/v1/jameyas`

Ranked, personalized, paginated marketplace.

**Query parameters**

| Param | Type | Default | Notes |
|---|---|---|---|
| `sort` | `recommended` \| `starting_soon` \| `seats_left` \| `monthly_asc` \| `monthly_desc` \| `newest` | `recommended` | `recommended` = personalized score |
| `minMonthly` / `maxMonthly` | int (minor) | – | Inclusive |
| `duration` | int | – | Exact months |
| `q` | string | – | Name search (min 2 chars) |
| `availableOnly` | bool | `true` | Hide full Jameyas |
| `page` | int | 1 | |
| `pageSize` | int | 20 | Max 50 |

**Request**
```http
GET /api/v1/jameyas?sort=recommended&maxMonthly=150000&page=1&pageSize=2
Authorization: Bearer <jwt>
```

**200 OK**
```json
{
  "data": [
    {
      "id": "5f8a1c3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b",
      "name": "Riyadh Savers 12M",
      "monthlyAmount": 100000,
      "currency": "SAR",
      "durationMonths": 12,
      "totalSeats": 12,
      "seatsAvailable": 2,
      "payoutAmount": 1200000,
      "minFee": 0,
      "maxFee": 36000,
      "startDate": "2026-12-01",
      "featured": true,
      "badges": ["FEATURED", "ALMOST_FULL", "BEST_MATCH"],
      "ranking": { "score": 0.91, "reasons": ["Matches your usual monthly amount", "Only 2 seats left"] },
      "asOf": "2026-11-21T10:00:03.000Z"
    },
    {
      "id": "9a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d",
      "name": "Jeddah Circle 10M",
      "monthlyAmount": 120000,
      "currency": "SAR",
      "durationMonths": 10,
      "totalSeats": 10,
      "seatsAvailable": 7,
      "payoutAmount": 1200000,
      "minFee": 0,
      "maxFee": 30000,
      "startDate": "2026-12-15",
      "featured": false,
      "badges": ["STARTING_SOON"],
      "ranking": { "score": 0.84, "reasons": ["Starts in 24 days"] },
      "asOf": "2026-11-21T10:00:03.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 2,
    "total": 1843,
    "asOf": "2026-11-21T10:00:03.000Z",
    "experiment": { "key": "ranking_v2", "variant": "treatment" }
  }
}
```

`meta.experiment` tells the client which A/B variant served this list; echo it in
[`POST /events`](events-and-health.md).

**400** `VALIDATION_ERROR` · **401** `UNAUTHORIZED`

---

## GET `/api/v1/jameyas/featured`

Up to 10 Jameyas from active marketing campaigns (priority order), excluding full ones.

**200 OK**
```json
{
  "data": [ { "...": "JameyaSummary (same shape as above)" } ],
  "meta": { "asOf": "2026-11-21T10:00:03.000Z" }
}
```

---

## GET `/api/v1/jameyas/{id}`

Jameya detail with the seat map **as seen by the viewer** (restrictions applied).

**Request**
```http
GET /api/v1/jameyas/5f8a1c3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b
Authorization: Bearer <jwt>
```

**200 OK** (viewer = `lina@pokunity.app`, HIGH risk)
```json
{
  "id": "5f8a1c3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b",
  "name": "Riyadh Savers 12M",
  "monthlyAmount": 100000,
  "currency": "SAR",
  "durationMonths": 12,
  "totalSeats": 12,
  "seatsAvailable": 3,
  "payoutAmount": 1200000,
  "minFee": 0,
  "maxFee": 36000,
  "startDate": "2026-12-01",
  "featured": true,
  "badges": ["FEATURED", "ALMOST_FULL"],
  "ranking": { "score": 0.91, "reasons": ["Only 3 seats left"] },
  "asOf": "2026-11-21T10:00:03.000Z",
  "seats": [
    { "seatNumber": 1, "payoutMonth": "2026-12", "fee": 36000, "status": "TAKEN", "heldByViewer": false, "restricted": true, "restrictionReason": "RISK_TIER" },
    { "seatNumber": 2, "payoutMonth": "2027-01", "fee": 33000, "status": "AVAILABLE", "heldByViewer": false, "restricted": true, "restrictionReason": "RISK_TIER" },
    { "seatNumber": 7, "payoutMonth": "2027-06", "fee": 12000, "status": "HELD", "heldByViewer": false, "restricted": false, "restrictionReason": null },
    { "seatNumber": 11, "payoutMonth": "2027-10", "fee": 0, "status": "AVAILABLE", "heldByViewer": false, "restricted": false, "restrictionReason": null },
    { "seatNumber": 12, "payoutMonth": "2027-11", "fee": 0, "status": "AVAILABLE", "heldByViewer": false, "restricted": false, "restrictionReason": null }
  ],
  "viewer": {
    "canReserve": true,
    "blockingReason": null,
    "activeReservationId": null
  }
}
```

(Seat array truncated for brevity; real response contains all `totalSeats` seats ordered by `seatNumber`.)

**Seat rules**
- `HELD` seats may become `AVAILABLE` again when the hold expires. UI should show them as "on hold".
- `heldByViewer: true` marks the viewer's own hold (UI links to that reservation).
- `restricted: true` → seat is not reservable by this viewer; UI greys it out with the reason.
- `viewer.blockingReason` is a `RestrictionReason` (e.g. `KYC_REQUIRED`) when the viewer cannot reserve any seat.

**404** `NOT_FOUND` · **401** `UNAUTHORIZED`
