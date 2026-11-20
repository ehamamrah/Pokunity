export type Badge = 'FEATURED' | 'ALMOST_FULL' | 'STARTING_SOON' | 'NEW' | 'BEST_MATCH';
export type SeatStatus = 'AVAILABLE' | 'HELD' | 'TAKEN';

/** Raw listing row (JSON-safe: it is cached in Redis). */
export interface JameyaRow {
  id: string;
  name: string;
  monthlyAmount: number;
  durationMonths: number;
  totalSeats: number;
  seatsAvailable: number;
  minFee: number;
  maxFee: number;
  startDate: string;
  /** ISO timestamp. */
  createdAt: string;
}

/**
 * Non-personal ranking inputs, precomputed once per snapshot (not per request): the hot path only
 * adds the two personal signals.
 */
export interface BaseSignals {
  scarcity: number;
  startingSoon: number;
  freshness: number;
  featured: number;
  daysToStart: number;
  ageDays: number;
}

/** Snapshot row used by the marketplace (availability may be up to 5 s stale). */
export interface JameyaListing extends JameyaRow {
  base: BaseSignals;
}

export interface Ranking {
  score: number;
  reasons: string[];
}

export interface JameyaSummary {
  id: string;
  name: string;
  monthlyAmount: number;
  currency: 'SAR';
  durationMonths: number;
  totalSeats: number;
  seatsAvailable: number;
  payoutAmount: number;
  minFee: number;
  maxFee: number;
  startDate: string;
  featured: boolean;
  badges: Badge[];
  ranking: Ranking;
  asOf: string;
}

export interface SeatRecord {
  seatNumber: number;
  fee: number;
  status: SeatStatus;
  reservationId: string | null;
  holderUserId: string | null;
}

const DAY_MS = 86_400_000;

/** Whole days from `now` (UTC midnight) until an ISO date; negative if in the past. */
export function daysUntil(isoDate: string, now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - today) / DAY_MS);
}

export function daysSince(isoTimestamp: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(isoTimestamp)) / DAY_MS);
}

/** 'YYYY-MM' of the month in which `seatNumber` receives the payout. */
export function payoutMonth(startDate: string, seatNumber: number): string {
  const [year, month] = startDate.split('-').map(Number);
  const index = year * 12 + (month - 1) + (seatNumber - 1);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}
