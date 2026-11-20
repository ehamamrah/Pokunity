import { RiskTier } from './user.types';

/** Share of earliest-payout seats that HIGH risk members may not take (early payout = credit risk). */
export const HIGH_RISK_RESTRICTED_SHARE = 0.3;

export function restrictedSeatCount(tier: RiskTier, totalSeats: number): number {
  return tier === 'HIGH' ? Math.ceil(totalSeats * HIGH_RISK_RESTRICTED_SHARE) : 0;
}

export function isSeatRestricted(tier: RiskTier, seatNumber: number, totalSeats: number): boolean {
  return seatNumber <= restrictedSeatCount(tier, totalSeats);
}
