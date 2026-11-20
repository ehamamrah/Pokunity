import { PaymentStatus } from './payment.types';

/**
 * State machine for payments (mirrored by the `payments_status_guard` DB trigger).
 * FAILED → VOIDED covers an authorization that arrived after we had already given up
 * (timeout): the late authorization is voided, the member is never charged.
 */
export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  AUTHORIZING: ['AUTHORIZED', 'FAILED'],
  AUTHORIZED: ['CAPTURED', 'VOIDED'],
  FAILED: ['VOIDED'],
  CAPTURED: [],
  VOIDED: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/** Statuses from which a transition into `to` is legal (used to build conditional UPDATEs). */
export function paymentSourcesOf(to: PaymentStatus): PaymentStatus[] {
  return (Object.keys(PAYMENT_TRANSITIONS) as PaymentStatus[]).filter((from) => canTransitionPayment(from, to));
}
