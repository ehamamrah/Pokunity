import type { FailureReason, JameyaBadge, KycStatus, RiskTier } from '@/shared/contract';

/** Typed fixtures modelled on the docs/api samples. Shared by unit tests and dev mock mode. */
export const SEEDED_VIEWER = {
  id: '0b7d2f1e-6f52-4c38-9a8e-3f1a2b4c5d6e',
  name: 'Sara Al-Qahtani',
  email: 'sara@pokunity.app',
  kycStatus: 'VERIFIED' as KycStatus,
  riskTier: 'LOW' as RiskTier,
};

export interface JameyaDef {
  id: string;
  name: string;
  monthlyAmount: number;
  durationMonths: number;
  startDate: string;
  maxFee: number;
  featured: boolean;
  /** Seat numbers already confirmed by members (TAKEN). */
  takenSeats: number[];
  /** Seat numbers held by other members (HELD). */
  heldSeats: number[];
}

export const JAMEYA_DEFS: JameyaDef[] = [
  { id: '5f8a1c3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b', name: 'Riyadh Savers 12M', monthlyAmount: 100000, durationMonths: 12, startDate: '2026-12-01', maxFee: 36000, featured: true, takenSeats: [1], heldSeats: [7] },
  { id: '9a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d', name: 'Jeddah Circle 10M', monthlyAmount: 120000, durationMonths: 10, startDate: '2026-12-15', maxFee: 30000, featured: false, takenSeats: [], heldSeats: [] },
  { id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', name: 'Dammam Family 6M', monthlyAmount: 50000, durationMonths: 6, startDate: '2027-01-01', maxFee: 9000, featured: false, takenSeats: [2, 3, 4, 5, 6], heldSeats: [] },
  { id: '3d4e5f60-7a8b-4c9d-8e1f-2a3b4c5d6e7f', name: 'Madinah Trust 18M', monthlyAmount: 150000, durationMonths: 18, startDate: '2026-11-01', maxFee: 81000, featured: true, takenSeats: [], heldSeats: [] },
  { id: '4e5f6071-8a9b-4cad-9f20-3b4c5d6e7f80', name: 'Khobar Pioneers 12M', monthlyAmount: 200000, durationMonths: 12, startDate: '2027-02-01', maxFee: 48000, featured: false, takenSeats: [], heldSeats: [] },
  { id: '5f607182-9bac-4dbe-8031-4c5d6e7f8091', name: 'Abha Community 10M', monthlyAmount: 80000, durationMonths: 10, startDate: '2026-12-20', maxFee: 20000, featured: false, takenSeats: [], heldSeats: [] },
];

export function findJameyaDef(id: string): JameyaDef | undefined {
  return JAMEYA_DEFS.find((def) => def.id === id);
}

/** Fee falls linearly from the maximum (earliest payout) to zero (last payout). */
export function feeForSeat(def: JameyaDef, seatNumber: number): number {
  const total = def.durationMonths;
  if (total <= 1) return 0;
  return Math.round((def.maxFee * (total - seatNumber)) / (total - 1));
}

export function payoutMonthForSeat(def: JameyaDef, seatNumber: number): string {
  const [yearText, monthText] = def.startDate.split('-');
  const start = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + (seatNumber - 1), 1));
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function badgesFor(def: JameyaDef, seatsAvailable: number): JameyaBadge[] {
  const badges: JameyaBadge[] = [];
  if (def.featured) badges.push('FEATURED');
  if (seatsAvailable > 0 && seatsAvailable <= 2) badges.push('ALMOST_FULL');
  if (def.startDate < '2026-12-31') badges.push('STARTING_SOON');
  return badges;
}

export const FAILURE_BY_TOKEN: Record<string, FailureReason | null> = {
  tok_decline: 'PAYMENT_DECLINED',
  tok_timeout: 'PAYMENT_TIMEOUT',
};
