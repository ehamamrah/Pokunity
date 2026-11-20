import { RiskTier, KycView } from '../../../users/domain/user.types';

/** Everything the eligibility chain needs, fetched up front (checks themselves are pure). */
export interface ReservationAttempt {
  userId: string;
  seatNumber: number;
  totalSeats: number;
  kyc: KycView;
  riskTier: RiskTier;
  maxActiveHolds: number;
  activeHolds: number;
  activeReservationInJameya: string | null;
  isSeatRestricted: (tier: RiskTier, seatNumber: number, totalSeats: number) => boolean;
}

/**
 * Chain of Responsibility: each handler validates one precondition and either throws a contract
 * error or passes the attempt to the next handler. Order = contract order (cheapest/most
 * fundamental first): KYC → active reservation → hold limit → risk tier.
 */
export abstract class PreconditionHandler<T> {
  private next: PreconditionHandler<T> | null = null;

  setNext(handler: PreconditionHandler<T>): PreconditionHandler<T> {
    this.next = handler;
    return handler;
  }

  handle(attempt: T): void {
    this.check(attempt);
    this.next?.handle(attempt);
  }

  protected abstract check(attempt: T): void;
}

/** Fields needed by the limit checks (re-validated inside the booking transaction). */
export type LimitsSnapshot = Pick<ReservationAttempt, 'activeHolds' | 'maxActiveHolds' | 'activeReservationInJameya'>;
