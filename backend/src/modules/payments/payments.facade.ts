import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../shared/config/app-config';
import { randomUUID } from 'node:crypto';
import { SqlExecutor } from '../../shared/database/sql-executor';
import { PaymentRecord, PaymentSummary } from './domain/payment.types';
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
    private readonly config: AppConfig,
  ) {}

  registerSettlement(settlement: ReservationSettlement): void {
    this.registry.register(settlement);
  }

  /**
   * Step 1 (inside the checkout transaction): create the AUTHORIZING payment row AND its AUTHORIZE
   * outbox command. Both commit with the PAYMENT_PENDING transition, so no crash can lose the request.
   */
  async open(tx: SqlExecutor, request: AuthorizationRequest): Promise<PaymentSummary> {
    const payment = await this.payments.insert(tx, { id: randomUUID(), ...request });
    await this.outbox.enqueueAuthorize(tx, payment.id);
    return this.toSummary(payment);
  }

  /** Step 2 (after commit): wake the outbox relay so authorization starts immediately (async). */
  requestAuthorization(): void {
    this.relay.kick();
  }

  async summariesFor(reservationIds: string[]): Promise<Map<string, PaymentSummary>> {
    const records = await this.payments.byReservations(reservationIds);
    return new Map([...records].map(([reservationId, p]) => [reservationId, this.toSummary(p)]));
  }

  /** resolveBy = reconciliation deadline while the outcome is open; null once the payment is decided. */
  private toSummary(p: PaymentRecord): PaymentSummary {
    const deadline = p.createdAt.getTime() + this.config.env.PAYMENT_TIMEOUT_SECONDS * 1000;
    const resolveBy = p.status === 'AUTHORIZING' ? new Date(deadline).toISOString() : null;
    return { id: p.id, status: p.status, amount: p.amount, currency: p.currency, resolveBy };
  }
}
