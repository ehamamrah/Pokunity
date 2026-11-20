import type { Seat } from '@/shared/contract';

/**
 * Suggests the open seats closest to the one that just failed, preferring the nearest
 * seat number so the user keeps a similar payout timing. Pure, so it is easy to test.
 */
export function nearestAvailableSeats(seats: readonly Seat[], target: number, count = 3): number[] {
  return seats
    .filter((seat) => seat.status === 'AVAILABLE' && !seat.restricted && seat.seatNumber !== target)
    .sort((a, b) => Math.abs(a.seatNumber - target) - Math.abs(b.seatNumber - target) || a.seatNumber - b.seatNumber)
    .slice(0, count)
    .map((seat) => seat.seatNumber);
}
