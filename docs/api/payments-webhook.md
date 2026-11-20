# Payment Provider Webhook

Server-to-server only. **Not called by the frontend.** In local/dev the in-process
**Payment Provider Simulator** (backend module) calls this endpoint, including deliberate
delays, duplicates and missing callbacks (see test tokens in [README](README.md)).

## POST `/api/v1/payments/webhook`

**Headers**

| Header | Notes |
|---|---|
| `X-Pokunity-Signature` | Hex HMAC-SHA256 of the **raw** request body using `PAYMENT_WEBHOOK_SECRET` |
| `Content-Type` | `application/json` |

**Event types**

| `type` | Effect |
|---|---|
| `payment.authorized` | Confirm seat (atomic, conditional on `PAYMENT_PENDING`) → enqueue capture via outbox. If seat cannot be confirmed → enqueue **void**. |
| `payment.failed` | Reservation → `FAILED` (`PAYMENT_DECLINED`), seat → `AVAILABLE`. |
| `payment.captured` | Payment → `CAPTURED` (ledger entry). |
| `payment.voided` | Payment → `VOIDED` (ledger entry). |

**Request**
```http
POST /api/v1/payments/webhook
X-Pokunity-Signature: 9f2c1b7e0a...
Content-Type: application/json

{
  "eventId": "evt_01JDX4M2Q8R7S6T5V4W3X2Y1Z0",
  "type": "payment.authorized",
  "paymentIntentId": "pi_01JDX4K9A8B7C6D5E4F3G2H1J0",
  "amount": 12000,
  "currency": "SAR",
  "occurredAt": "2026-11-21T10:01:10.000Z",
  "failureCode": null
}
```

**200 OK** (first delivery)
```json
{ "received": true, "duplicate": false }
```

**200 OK** (same `eventId` delivered again – no side effects)
```json
{ "received": true, "duplicate": true }
```

**Errors**
- `401 INVALID_SIGNATURE` – signature missing/invalid (provider will retry; we never process unsigned events).
- `400 VALIDATION_ERROR` – malformed payload.
- `404 NOT_FOUND` is **not** returned for unknown `paymentIntentId`; it is stored as an
  orphan event (`200`, flagged for reconciliation) so the provider stops retrying.

**Edge-case handling summary**

| Scenario | Handling |
|---|---|
| Duplicate callback | `eventId` unique constraint → second insert no-ops → `duplicate: true` |
| Out-of-order (`captured` before `authorized` processed) | State transitions are conditional; events that don't apply are recorded and ignored |
| Authorized after reservation already `FAILED` (timeout) | Seat not confirmable → **void** authorization (no charge) |
| Callback never arrives | Reconciliation job queries provider after 2 min in `PAYMENT_PENDING`; resolves or voids after 10 min |
| Capture call fails | Outbox retries with exponential backoff; seat stays `CONFIRMED` (funds already authorized) |
