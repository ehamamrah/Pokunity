import { Injectable } from '@nestjs/common';
import { SqlExecutor } from '../../shared/database/sql-executor';

export type PaymentFailureReason = 'PAYMENT_DECLINED' | 'PAYMENT_TIMEOUT';

export interface SettlementOutcome {
  /** Whether the reservation transition was applied (false = reservation no longer confirmable). */
  applied: boolean;
  /** Side effects to run only after the surrounding transaction committed. */
  afterCommit: () => Promise<void>;
}

/**
 * Port implemented by the reservations module (Dependency Inversion): payments drives
 * reservation outcomes inside its own transaction without importing the reservations module.
 */
export interface ReservationSettlement {
  confirm(tx: SqlExecutor, reservationId: string): Promise<SettlementOutcome>;
  fail(tx: SqlExecutor, reservationId: string, reason: PaymentFailureReason): Promise<SettlementOutcome>;
}

@Injectable()
export class SettlementRegistry {
  private settlement: ReservationSettlement | null = null;

  register(settlement: ReservationSettlement): void {
    this.settlement = settlement;
  }

  get handler(): ReservationSettlement {
    if (!this.settlement) throw new Error('No ReservationSettlement registered');
    return this.settlement;
  }
}
