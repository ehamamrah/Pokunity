import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SqlExecutor } from '../../shared/database/sql-executor';
import { PaymentSummary } from './domain/payment.types';
import { OutboxProcessorJob } from './application/outbox-processor.job';
import { OutboxRepository } from './infrastructure/outbox.repository';
import { PaymentsRepository } from './infrastructure/payments.repository';
import { ReservationSettlement, SettlementRegistry } from './settlement.port';

export type { PaymentSummary } from './domain/payment.types';
export type { ReservationSettlement, SettlementOutcome, PaymentFailureReason } from './settlement.port';

export interface AuthorizationRequest {
  reservationId: string;
  userId: string;
  amount: number;
  token: string;
}

/** Public API (Facade) of the payments module. */
@Injectable()
export class PaymentsFacade {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly outbox: OutboxRepository,
    private readonly relay: OutboxProcessorJob,
    private readonly registry: SettlementRegistry,
  ) {}

  registerSettlement(settlement: ReservationSettlement): void {
    this.registry.register(settlement);
  }

  /**
   * Step 1 (inside the checkout transaction): create the AUTHORIZING payment row AND its AUTHORIZE
   * outbox command. Both commit with the PAYMENT_PENDING transition, so no crash can lose the request.
   */
  async open(tx: SqlExecutor, request: AuthorizationRequest): Promise<PaymentSummary> {
    const { id, status, amount, currency } = await this.payments.insert(tx, { id: randomUUID(), ...request });
    await this.outbox.enqueueAuthorize(tx, id);
    return { id, status, amount, currency };
  }

  /** Step 2 (after commit): wake the outbox relay so authorization starts immediately (async). */
  requestAuthorization(): void {
    this.relay.kick();
  }

  summariesFor(reservationIds: string[]): Promise<Map<string, PaymentSummary>> {
    return this.payments.summariesByReservation(reservationIds);
  }
}
