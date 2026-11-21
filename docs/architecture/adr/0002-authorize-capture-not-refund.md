# ADR-0002: Authorize → confirm seat → capture (void, never refund)

**Status:** Accepted

## Context

"Users must not be charged without a guaranteed seat." A naive charge-then-allocate flow needs
refunds when allocation fails. Refunds are slow for the member (days), cost fees, and show up
on statements, which is a poor experience and a compliance risk in a regulated product.

## Decision

1. Checkout moves the reservation `HELD → PAYMENT_PENDING` (only if `expires_at > now()`) and
   creates a payment `AUTHORIZING` in one transaction; the provider is asked to **authorize**
   only after commit.
2. On `payment.authorized`, one transaction does: insert event (dedup) → conditional
   `PAYMENT_PENDING → CONFIRMED` + seat `HELD → TAKEN` → payment `AUTHORIZED` → ledger
   `AUTHORIZE` → outbox `CAPTURE`. If the reservation can no longer be confirmed, outbox `VOID` instead.
3. Captures and voids are executed by the outbox relay.
4. A `PAYMENT_PENDING` reservation is never expired by the sweeper; only a payment outcome or
   reconciliation resolves it. The seat is therefore guaranteed while funds are held.
5. Zero-fee seats skip the provider (`HELD → CONFIRMED`, `200`, `payment: null`).

## Consequences

* Funds are captured only for a seat already marked `TAKEN` in the same commit.
* Failure paths end in a **void**: the authorization disappears from the member's statement and nothing is charged.
* A hold in `PAYMENT_PENDING` can occupy a seat for up to the reconciliation timeout (10 min).
  This is acceptable and bounded.
* Capture failures after confirmation are retried; the seat stays `CONFIRMED` (funds are authorized).

## Alternatives considered

* **Charge then refund on conflict.** Rejected for the reasons above.
* **Capture synchronously in the webhook transaction.** This holds DB locks across a network
  call, and a crash after capture but before commit would charge without a seat.
