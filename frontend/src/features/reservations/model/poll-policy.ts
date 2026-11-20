import { TIMING } from '@/shared/config/timing';
import type { ReservationStatus } from '@/shared/contract';
import { isTerminalStatus } from './status';

/**
 * Polling policy for GET /reservations/{id}, expressed as a pure function so the stop
 * condition is testable: terminal -> stop (false); PAYMENT_PENDING -> 1.5 s, backing off
 * to 3 s after 15 s; HELD -> 5 s to notice server-side expiry.
 */
export function pollIntervalFor(status: ReservationStatus | undefined, pendingElapsedMs: number): number | false {
  if (status === undefined) return TIMING.checkoutFastPollMs;
  if (isTerminalStatus(status)) return false;
  if (status === 'PAYMENT_PENDING') {
    return pendingElapsedMs < TIMING.checkoutFastWindowMs ? TIMING.checkoutFastPollMs : TIMING.checkoutSlowPollMs;
  }
  return TIMING.holdRefetchMs;
}
