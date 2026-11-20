import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { LimitsSnapshot, PreconditionHandler, ReservationAttempt } from './precondition';

/** Regulated product: booking fails closed unless KYC is positively VERIFIED. */
export class KycVerifiedHandler<T extends Pick<ReservationAttempt, 'kyc'>> extends PreconditionHandler<T> {
  protected check({ kyc }: T): void {
    if (kyc.status === 'VERIFIED') return;
    if (kyc.status === 'UNKNOWN') {
      throw new AppError(ErrorCode.KYC_UNAVAILABLE, 'Identity verification is temporarily unavailable. Please try again shortly.');
    }
    throw new AppError(ErrorCode.KYC_REQUIRED, 'Identity verification (KYC) is required before reserving a seat.', { kycStatus: kyc.status });
  }
}

export class SingleActiveReservationHandler<T extends LimitsSnapshot> extends PreconditionHandler<T> {
  protected check({ activeReservationInJameya }: T): void {
    if (!activeReservationInJameya) return;
    throw new AppError(ErrorCode.ACTIVE_RESERVATION_EXISTS, 'You already have an active reservation in this Jameya.', {
      reservationId: activeReservationInJameya,
    });
  }
}

export class HoldLimitHandler<T extends LimitsSnapshot> extends PreconditionHandler<T> {
  protected check({ activeHolds, maxActiveHolds }: T): void {
    if (activeHolds < maxActiveHolds) return;
    throw new AppError(ErrorCode.HOLD_LIMIT_REACHED, `You can hold at most ${maxActiveHolds} seat(s) at a time.`, {
      maxActiveHolds, activeHolds,
    });
  }
}

export class RiskTierHandler extends PreconditionHandler<ReservationAttempt> {
  protected check(a: ReservationAttempt): void {
    if (!a.isSeatRestricted(a.riskTier, a.seatNumber, a.totalSeats)) return;
    throw new AppError(ErrorCode.RISK_RESTRICTED, `Seat ${a.seatNumber} is not available for your risk tier.`, {
      seatNumber: a.seatNumber, riskTier: a.riskTier,
    });
  }
}

/** Factory: the full reservation eligibility chain in contract order. */
export function buildReservationChain(): PreconditionHandler<ReservationAttempt> {
  const head = new KycVerifiedHandler<ReservationAttempt>();
  head
    .setNext(new SingleActiveReservationHandler<ReservationAttempt>())
    .setNext(new HoldLimitHandler<ReservationAttempt>())
    .setNext(new RiskTierHandler());
  return head;
}

/** The subset re-validated inside the transaction under the per-user lock (authoritative). */
export function buildLimitsChain(): PreconditionHandler<LimitsSnapshot> {
  const head = new SingleActiveReservationHandler<LimitsSnapshot>();
  head.setNext(new HoldLimitHandler<LimitsSnapshot>());
  return head;
}
