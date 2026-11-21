# Seat Reservation (Task 1)

How a member goes from "I want seat 7" to a paid, confirmed seat.

**In short:**

- PostgreSQL claims the seat with one conditional `UPDATE`, so only one request can win it.
- The hold lasts 5 minutes. Payment is only **authorized** (funds held) until the seat is confirmed, then **captured**. If the seat is lost, the authorization is **voided**, so there is never a refund.
- Duplicate clicks, duplicate webhooks and lost webhooks are absorbed by idempotency keys, unique event ids and a reconciliation job.

API: [reservations](../api/reservations.md) · [webhook](../api/payments-webhook.md). Every edge case: [edge cases](edge-cases.md).

## 1. Lifecycle

```mermaid
stateDiagram-v2
  [*] --> HELD: POST /reservations<br/>(seat AVAILABLE→HELD, same tx)
  HELD --> PAYMENT_PENDING: checkout, only if expires_at > now()
  HELD --> CONFIRMED: checkout of a zero-fee seat
  HELD --> EXPIRED: sweeper (expires_at < now())
  HELD --> CANCELLED: DELETE by owner
  PAYMENT_PENDING --> CONFIRMED: payment.authorized (seat HELD→TAKEN) → outbox CAPTURE
  PAYMENT_PENDING --> FAILED: payment.failed / reconciliation timeout (seat released, auth voided)
```

These transitions are enforced three times: in code, in every `UPDATE ... WHERE status = <expected>`, and by a database trigger.

## 2. Placing a hold

Checks run cheapest first:

| # | Check | Where | Result |
|---|---|---|---|
| 1 | Rate limit: 5 per 10 s per member | `RateLimitGuard` | `429` + `Retry-After` |
| 2 | Idempotency key | `IdempotencyInterceptor` | replay, `409`, `422`, `400` |
| 3 | KYC verified (cached) | `KycVerifiedHandler` | `403 KYC_REQUIRED`, `503 KYC_UNAVAILABLE` |
| 4 | One hold per Jameya, at most 3 in total (1 after 3+ expired holds) | `SingleActiveReservationHandler`, `HoldLimitHandler` | `409` |
| 5 | Risk tier: HIGH can't take the first 30% of seats | `RiskTierHandler` | `403 RISK_RESTRICTED` |
| 6 | Redis gate: seats left? seat already being claimed? | `AvailabilityGateService` | `409 JAMEYA_FULL` / `SEAT_UNAVAILABLE` |
| 7 | Atomic claim in PostgreSQL | `CreateReservationUseCase.claimInTransaction` | `201` or `409 SEAT_UNAVAILABLE` |

Step 7 is one transaction:

```sql
SELECT pg_advisory_xact_lock(hashtext('reservations:user:' || $user));   -- serialise this member
SELECT count(*) … WHERE user_id = $user AND status IN ('HELD','PAYMENT_PENDING');  -- re-check 4
UPDATE seats SET status='HELD', reservation_id=$res, holder_user_id=$user
 WHERE jameya_id=$j AND seat_number=$n AND status='AVAILABLE' RETURNING fee;     -- the claim
INSERT INTO reservations (…, fee, status, expires_at) VALUES (…, $fee, 'HELD', now() + 300s);
INSERT INTO audit_log …;
```

The fee is copied into the reservation, so later price changes don't affect it.

## 3. Sequence diagrams

### 3.1 Happy path (`tok_success`)

```mermaid
sequenceDiagram
  autonumber
  participant M as Member
  participant API
  participant DB as PostgreSQL
  participant PSP as Provider (simulator)
  participant OB as Outbox relay
  M->>API: POST /reservations {seat 7}
  API->>DB: tx: claim seat (AVAILABLE→HELD) + insert HELD reservation
  API-->>M: 201 HELD (expiresAt)
  M->>API: POST /reservations/{id}/checkout {tok_success}
  API->>DB: tx: HELD→PAYMENT_PENDING if expires_at>now() + insert payment AUTHORIZING
  API->>PSP: authorize(reference=paymentId, amount=fee)
  PSP-->>API: intentId
  API-->>M: 202 PAYMENT_PENDING (payment AUTHORIZING)
  loop poll every ~1.5 s
    M->>API: GET /reservations/{id}
  end
  PSP->>API: webhook payment.authorized (HMAC)
  API->>DB: tx: insert event (dedup) · lock payment · PAYMENT_PENDING→CONFIRMED · seat HELD→TAKEN · payment AUTHORIZED · ledger AUTHORIZE · outbox CAPTURE
  OB->>DB: claim outbox row (SKIP LOCKED, lease)
  OB->>PSP: capture(intent, key=capture:paymentId)
  OB->>DB: tx: payment CAPTURED · ledger CAPTURE · outbox DONE
  M->>API: GET /reservations/{id}
  API-->>M: CONFIRMED, payment CAPTURED
```

### 3.2 Declined (`tok_decline`)

```mermaid
sequenceDiagram
  participant PSP
  participant API
  participant DB
  PSP->>API: payment.failed (INSUFFICIENT_FUNDS)
  API->>DB: tx: event · payment AUTHORIZING→FAILED · reservation PAYMENT_PENDING→FAILED (PAYMENT_DECLINED) · seat HELD→AVAILABLE
  API->>API: after commit: gate counter +1
  Note over API,DB: Nothing was authorized, so nothing to void or refund. payment.status = FAILED.
```

### 3.3 Duplicate callback (`tok_duplicate`)

```mermaid
sequenceDiagram
  participant PSP
  participant API
  participant DB
  par three concurrent deliveries of evt_X
    PSP->>API: payment.authorized evt_X
    PSP->>API: payment.authorized evt_X
    PSP->>API: payment.authorized evt_X
  end
  API->>DB: INSERT payment_events(evt_X) ON CONFLICT DO NOTHING
  Note over DB: one insert wins, the other two wait on the PK, then insert nothing
  API-->>PSP: {duplicate:false} once, {duplicate:true} twice
  Note over API,DB: Only the winner confirms the seat and enqueues CAPTURE.<br/>Outbox UNIQUE(payment_id) and ledger UNIQUE(payment_id, CAPTURE) make a second capture impossible.
```

### 3.4 Lost callback / provider timeout (`tok_timeout`)

```mermaid
sequenceDiagram
  participant REC as Reconciliation (10 s)
  participant PSP
  participant DB
  Note over PSP: provider authorized, but the webhook is never sent
  REC->>DB: payments AUTHORIZING older than 2 min
  REC->>PSP: getIntent(intentId / reference=paymentId)
  alt AUTHORIZED
    REC->>DB: tx: synthetic event recon_<id>_authorized · same path as 3.1 (confirm → CAPTURE)
  else FAILED
    REC->>DB: tx: same path as 3.2
  else still PENDING and older than 10 min, or unknown to provider
    REC->>DB: tx: payment FAILED (PAYMENT_TIMEOUT) · reservation FAILED · seat released · outbox VOID
  end
```

With `tok_timeout` the simulator authorizes but never calls back, so reconciliation confirms the seat about 2 minutes later.

If an authorization arrives **after** a payment was timed out, it is voided straight away and the reservation stays `FAILED`. The member is never charged.

### 3.5 Hold expiry racing payment

```mermaid
sequenceDiagram
  participant M as Member
  participant API
  participant SW as Sweeper
  participant DB
  par at T = expires_at - ε
    M->>API: checkout
    API->>DB: SELECT … FOR UPDATE (row lock) → UPDATE … WHERE status='HELD' AND expires_at > now()
  and
    SW->>DB: SELECT … WHERE status='HELD' AND expires_at < now() FOR UPDATE SKIP LOCKED
  end
  Note over DB: The sweeper skips the locked row. If checkout won before expiry → PAYMENT_PENDING, and the sweeper can never expire it.<br/>If the clock passed expiry → checkout matches 0 rows → 410 RESERVATION_EXPIRED, and the next sweep expires the hold.
```

## 4. How consistency is ensured

1. **One winner per seat.** A conditional update claims the seat; a unique index backs it up.
2. **All or nothing.** Seat, reservation, payment, ledger, outbox and audit change in one transaction.
3. **Conditional transitions.** Duplicates and out-of-order events match zero rows and are ignored.
4. **No provider calls inside transactions.** Capture and void go through an outbox, so a crash loses nothing.
5. **Self-healing.** Reconciliation settles stuck payments; the Redis gate is rebuilt from PostgreSQL.
6. **The database refuses illegal states** (triggers, checks, unique indexes), even if the code has a bug.

## 5. Trade-offs

| Choice | Benefit | Cost |
|---|---|---|
| Hold first, pay second | The seat is theirs before they enter card details | Hoarding, limited by hold limits and rate limits |
| Authorize, then capture | No refunds ever | Two provider calls |
| `PAYMENT_PENDING` never times out by TTL | No seat released while money is moving | A stuck payment can block a seat up to 10 min |
| Redis gate fails open | Redis down doesn't stop booking | All load reaches PostgreSQL (correct, slower) |
| Per-seat single-flight lock | N claims on one seat become 1 DB query | A loser may need to retry if the winner fails |
