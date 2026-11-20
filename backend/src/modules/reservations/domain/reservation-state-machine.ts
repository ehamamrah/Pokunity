import { ReservationStatus } from './reservation.types';

/**
 * Reservation lifecycle (docs/api/reservations.md). Mirrored in PostgreSQL by the
 * `reservations_status_guard` trigger, so an illegal transition fails even if app code is wrong.
 * HELD → CONFIRMED is the zero-fee path (no payment needed).
 */
export const RESERVATION_TRANSITIONS: Readonly<Record<ReservationStatus, readonly ReservationStatus[]>> = {
  HELD: ['PAYMENT_PENDING', 'EXPIRED', 'CANCELLED', 'CONFIRMED'],
  PAYMENT_PENDING: ['CONFIRMED', 'FAILED'],
  CONFIRMED: [],
  EXPIRED: [],
  CANCELLED: [],
  FAILED: [],
};

export const ACTIVE_STATUSES: readonly ReservationStatus[] = ['HELD', 'PAYMENT_PENDING'];

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return RESERVATION_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: ReservationStatus): boolean {
  return RESERVATION_TRANSITIONS[status].length === 0;
}

export function isActive(status: ReservationStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** Legal source statuses for a target status (drives conditional UPDATE ... WHERE status = ANY(...)). */
export function sourcesOf(to: ReservationStatus): ReservationStatus[] {
  return (Object.keys(RESERVATION_TRANSITIONS) as ReservationStatus[]).filter((from) => canTransition(from, to));
}
