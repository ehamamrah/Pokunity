import type { FailureReason, ReservationStatus } from '@/shared/contract';

export interface OutcomeCopy {
  title: string;
  body: string;
}

/** Every failure copy states the money outcome explicitly, because that is what users worry about. */
export const FAILURE_COPY: Record<FailureReason, OutcomeCopy> = {
  // v1.1 payment status rules: a decline never authorized anything; a late authorization is voided.
  PAYMENT_DECLINED: {
    title: 'Payment was declined',
    body: 'Your card was not charged. The payment was declined before anything was reserved on your account.',
  },
  PAYMENT_TIMEOUT: {
    title: 'We could not confirm your payment in time',
    body: 'The provider did not confirm before the deadline. Your card was not charged. If an authorization arrived late, it was voided.',
  },
  HOLD_EXPIRED: {
    title: 'Your hold expired',
    body: 'The seat was released before payment was completed. You were not charged.',
  },
  SEAT_CONFLICT: {
    title: 'The seat was taken',
    body: 'Another member confirmed this seat first. You were not charged.',
  },
};

export function failureCopyFor(reason: FailureReason | null): OutcomeCopy {
  if (reason) return FAILURE_COPY[reason];
  return { title: 'This reservation did not complete', body: 'No charge was made.' };
}

/** Terminal non-failure outcomes, used by the checkout outcome banner and the list. */
export const STATUS_OUTCOME_COPY: Partial<Record<ReservationStatus, OutcomeCopy>> = {
  CONFIRMED: {
    title: 'Your seat is confirmed',
    body: 'Payment was taken only now, after the seat was secured. Your payout month is on the reservation.',
  },
  CANCELLED: { title: 'Seat released', body: 'The hold was released. No charge was made.' },
  EXPIRED: { title: 'Your hold expired', body: 'Holds last a few minutes. Pick the seat again to continue. No charge was made.' },
};
