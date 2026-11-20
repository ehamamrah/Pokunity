import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SqlExecutor } from '../../shared/database/sql-executor';
import { withTimeout } from '../../shared/utils/timeout';
import { PaymentSummary } from './domain/payment.types';
import { PaymentsRepository } from './infrastructure/payments.repository';
import { PaymentGateway } from './payment-gateway.port';
import { ReservationSettlement, SettlementRegistry } from './settlement.port';

export type { PaymentSummary } from './domain/payment.types';
export type { ReservationSettlement, SettlementOutcome, PaymentFailureReason } from './settlement.port';

export interface AuthorizationRequest {
  reservationId: string;
  userId: string;
  amount: number;
  token: string;
}

const PROVIDER_CALL_TIMEOUT_MS = 5000;

/** Public API (Facade) of the payments module. */
@Injectable()
export class PaymentsFacade {
  private readonly logger = new Logger(PaymentsFacade.name);

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly gateway: PaymentGateway,
    private readonly registry: SettlementRegistry,
  ) {}

  registerSettlement(settlement: ReservationSettlement): void {
    this.registry.register(settlement);
  }

  /** Step 1 (inside the checkout transaction): create the AUTHORIZING payment row. */
  async open(tx: SqlExecutor, request: AuthorizationRequest): Promise<PaymentSummary> {
    const { id, status, amount, currency } = await this.payments.insert(tx, { id: randomUUID(), ...request });
    return { id, status, amount, currency };
  }

  /**
   * Step 2 (after commit): ask the provider to authorize. Failures are tolerated: the payment stays
   * AUTHORIZING and reconciliation looks the intent up by our reference (the payment id).
   */
  async requestAuthorization(paymentId: string, request: AuthorizationRequest): Promise<void> {
    const call = this.gateway.authorize({ reference: paymentId, amount: request.amount, currency: 'SAR', token: request.token });
    try {
      const { intentId } = await withTimeout(call, PROVIDER_CALL_TIMEOUT_MS);
      await this.payments.setIntent(paymentId, intentId);
    } catch (error) {
      this.logger.error({ msg: 'authorize call failed; reconciliation will resolve', paymentId, error: String(error) });
    }
  }

  summariesFor(reservationIds: string[]): Promise<Map<string, PaymentSummary>> {
    return this.payments.summariesByReservation(reservationIds);
  }
}
