import type { JameyaDetail } from '@/shared/contract';

/**
 * Optimistic overlay for the seat map: the seat is shown as HELD immediately. The original
 * snapshot is kept by the caller so a failed request can roll back exactly.
 */
export function markSeatHeld(detail: JameyaDetail, seatNumber: number): JameyaDetail {
  return {
    ...detail,
    seats: detail.seats.map((seat) =>
      seat.seatNumber === seatNumber && seat.status === 'AVAILABLE' ? { ...seat, status: 'HELD' } : seat,
    ),
  };
}

/** One idempotency scope per (Jameya, seat): changing seat means a new user intent. */
export function reserveScope(jameyaId: string, seatNumber: number): string {
  return `reserve:${jameyaId}:${seatNumber}`;
}
