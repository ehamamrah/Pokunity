import { KycStatus } from '../../users/domain/user.types';
import { payoutMonth, SeatRecord, SeatStatus } from './jameya';

export type RestrictionReason = 'KYC_REQUIRED' | 'RISK_TIER' | 'KYC_UNAVAILABLE';

export interface SeatView {
  seatNumber: number;
  payoutMonth: string;
  fee: number;
  status: SeatStatus;
  heldByViewer: boolean;
  restricted: boolean;
  restrictionReason: RestrictionReason | null;
}

export type BlockingReason = RestrictionReason | 'HOLD_LIMIT';

/** Seat-level block: KYC must be VERIFIED to reserve anything (fail closed when UNKNOWN). */
export function blockingReasonOf(kyc: KycStatus): RestrictionReason | null {
  if (kyc === 'VERIFIED') return null;
  return kyc === 'UNKNOWN' ? 'KYC_UNAVAILABLE' : 'KYC_REQUIRED';
}

/**
 * Viewer-level block (v1.1): KYC first; then HOLD_LIMIT when the viewer already holds the maximum
 * number of seats elsewhere. A hold in THIS Jameya is explained by `activeReservationId` instead.
 */
export function viewerBlockingReason(
  kyc: KycStatus,
  holds: { active: number; max: number; heldHere: boolean },
): BlockingReason | null {
  const kycReason = blockingReasonOf(kyc);
  if (kycReason) return kycReason;
  return !holds.heldHere && holds.active >= holds.max ? 'HOLD_LIMIT' : null;
}

export function toSeatView(
  seat: SeatRecord,
  ctx: { startDate: string; viewerId: string; blocking: RestrictionReason | null; riskRestricted: boolean },
): SeatView {
  const reason = ctx.blocking ?? (ctx.riskRestricted ? 'RISK_TIER' : null);
  return {
    seatNumber: seat.seatNumber,
    payoutMonth: payoutMonth(ctx.startDate, seat.seatNumber),
    fee: seat.fee,
    status: seat.status,
    heldByViewer: seat.status === 'HELD' && seat.holderUserId === ctx.viewerId,
    restricted: reason !== null,
    restrictionReason: reason,
  };
}
