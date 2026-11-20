import { CHECKOUT_DELAYS_MS } from './payment-simulator';
import { db, HOLD_TTL_MS, type StoredReservation } from './db';

interface Outcome {
  status: StoredReservation['status'];
  failureReason?: StoredReservation['failureReason'];
  paymentStatus?: StoredReservation['paymentStatus'];
}

/**
 * Applies time-based transitions lazily, on every read. This mirrors the backend's sweeper
 * and provider callbacks without timers, so polling in tests and the demo sees realistic progression.
 */
export function settle(reservation: StoredReservation, nowMs: number = Date.now()): StoredReservation {
  if (reservation.status === 'HELD' && nowMs >= reservation.expiresAt) {
    return transition(reservation, { status: 'EXPIRED' }, nowMs);
  }
  if (reservation.status === 'PAYMENT_PENDING' && reservation.pay) {
    const delay = CHECKOUT_DELAYS_MS[reservation.pay.token] ?? 1_000;
    if (nowMs < reservation.pay.startedAt + delay) return reservation;
    return resolvePayment(reservation, nowMs);
  }
  return reservation;
}

function resolvePayment(reservation: StoredReservation, nowMs: number): StoredReservation {
  const token = reservation.pay?.token ?? 'tok_success';
  if (token === 'tok_timeout') return reservation;
  if (token === 'tok_decline') {
    return transition(reservation, { status: 'FAILED', failureReason: 'PAYMENT_DECLINED', paymentStatus: 'FAILED' }, nowMs);
  }
  return transition(reservation, { status: 'CONFIRMED', paymentStatus: 'CAPTURED' }, nowMs);
}

function transition(reservation: StoredReservation, outcome: Outcome, nowMs: number): StoredReservation {
  const next: StoredReservation = {
    ...reservation,
    status: outcome.status,
    failureReason: outcome.failureReason ?? null,
    paymentStatus: outcome.paymentStatus ?? reservation.paymentStatus,
    updatedAt: new Date(nowMs).toISOString(),
  };
  db.reservations.set(next.id, next);
  return next;
}

export function holdExpiry(nowMs: number): number {
  return nowMs + HOLD_TTL_MS;
}
