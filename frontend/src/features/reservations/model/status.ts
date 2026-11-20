import type { Reservation, ReservationStatus } from '@/shared/contract';
import type { Tone } from '@/shared/ui/cx';

/** Contract: CONFIRMED, EXPIRED, CANCELLED and FAILED never change again. */
export const TERMINAL_STATUSES: readonly ReservationStatus[] = ['CONFIRMED', 'EXPIRED', 'CANCELLED', 'FAILED'];

export function isTerminalStatus(status: ReservationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export interface ReservationGroups {
  active: Reservation[];
  confirmed: Reservation[];
  past: Reservation[];
}

export function groupReservations(items: readonly Reservation[]): ReservationGroups {
  return {
    active: items.filter((item) => item.status === 'HELD' || item.status === 'PAYMENT_PENDING'),
    confirmed: items.filter((item) => item.status === 'CONFIRMED'),
    past: items.filter((item) => item.status === 'EXPIRED' || item.status === 'CANCELLED' || item.status === 'FAILED'),
  };
}

export interface StatusPresentation {
  label: string;
  tone: Tone;
}

/** Colour is never the only signal: every status also has a text label. */
export const STATUS_PRESENTATION: Record<ReservationStatus, StatusPresentation> = {
  HELD: { label: 'Seat on hold', tone: 'warning' },
  PAYMENT_PENDING: { label: 'Confirming payment', tone: 'info' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  EXPIRED: { label: 'Hold expired', tone: 'neutral' },
  CANCELLED: { label: 'Released', tone: 'neutral' },
  FAILED: { label: 'Not completed', tone: 'danger' },
};
