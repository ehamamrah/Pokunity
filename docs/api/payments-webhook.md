# Payment Provider Webhook

Called by the payment provider, never by the frontend. Locally, a built-in simulator calls it, including delays, duplicates and missing callbacks ([test tokens](README.md#payment-test-tokens)).

## POST `/api/v1/payments/webhook`

### Headers

| Header | Notes |
|---|---|
| `X-Pokunity-Signature` | Hex HMAC-SHA256 of the **raw** request body using `PAYMENT_WEBHOOK_SECRET` |
| `Content-Type` | `application/json` |

### Event types

| `type` | Effect |
|---|---|
| `payment.authorized` | Confirm the seat, then capture. If the seat can't be confirmed, void instead |
| `payment.failed` | Reservation `FAILED`, seat released |
| `payment.captured` | Payment `CAPTURED`, ledger entry |
| `payment.voided` | Payment `VOIDED`, ledger entry |

### Request

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

**200 OK** (same `eventId` again: nothing happens)

```json
{ "received": true, "duplicate": true }
```

### Errors

- `401 INVALID_SIGNATURE`: missing or wrong signature; nothing is processed.
- `400 VALIDATION_ERROR`: malformed payload.
- An unknown `paymentIntentId` still gets `200`. The event is kept as an orphan for reconciliation, so the provider stops retrying.

### Edge cases

| Scenario | Handling |
|---|---|
| Duplicate callback | Unique `eventId`: the second one does nothing |
| Out of order | Events that don't fit the current state are recorded and ignored |
| Authorized after the reservation failed | Void: no charge |
| Callback never arrives | Reconciliation asks the provider after 2 min; settles or voids by 10 min |
| Capture call fails | Outbox retries with backoff; the seat stays `CONFIRMED` |
