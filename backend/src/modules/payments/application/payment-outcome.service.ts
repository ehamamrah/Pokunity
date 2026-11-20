import { Injectable, Logger } from '@nestjs/common';
import { SqlExecutor } from '../../../shared/database/sql-executor';
import { AuditFacade } from '../../audit/audit.facade';
import { EventOutcome, PaymentRecord, ProviderEvent } from '../domain/payment.types';
import { LedgerRepository } from '../infrastructure/ledger.repository';
import { OutboxRepository } from '../infrastructure/outbox.repository';
import { PaymentsRepository } from '../infrastructure/payments.repository';
import { PaymentFailureReason, SettlementRegistry } from '../settlement.port';

export interface AppliedOutcome {
  outcome: EventOutcome;
  afterCommit: () => Promise<void>;
}

const noop = async () => undefined;
const ignored: AppliedOutcome = { outcome: 'IGNORED', afterCommit: noop };

/**
 * Applies provider facts to a locked payment inside the caller's transaction. Every transition is
 * conditional, so duplicates and out-of-order events degrade to IGNORED instead of corrupting state.
 */
@Injectable()
export class PaymentOutcomeService {
  private readonly logger = new Logger(PaymentOutcomeService.name);

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly ledger: LedgerRepository,
    private readonly outbox: OutboxRepository,
    private readonly settlement: SettlementRegistry,
    private readonly audit: AuditFacade,
  ) {}

  apply(tx: SqlExecutor, payment: PaymentRecord, event: ProviderEvent): Promise<AppliedOutcome> {
    if (event.amount !== payment.amount) return this.amountMismatch(payment, event);
    const handlers = {
      'payment.authorized': () => this.authorized(tx, payment),
      'payment.failed': () => this.failed(tx, payment, 'PAYMENT_DECLINED', event.failureCode ?? 'DECLINED'),
      'payment.captured': () => this.settle(tx, payment, 'CAPTURED'),
      'payment.voided': () => this.settle(tx, payment, 'VOIDED'),
    };
    return handlers[event.type]();
  }

  /** Confirm seat first; capture only if it was confirmed, otherwise void (never charge-then-refund). */
  async authorized(tx: SqlExecutor, payment: PaymentRecord): Promise<AppliedOutcome> {
    if (payment.status === 'FAILED') return this.voidLateAuthorization(tx, payment);
    if (payment.status !== 'AUTHORIZING') return ignored;
    const seat = await this.settlement.handler.confirm(tx, payment.reservationId);
    await this.payments.transition(tx, payment.id, 'AUTHORIZED');
    await this.ledger.append(tx, payment.id, 'AUTHORIZE');
    await this.outbox.enqueue(tx, payment.id, seat.applied ? 'CAPTURE' : 'VOID');
    await this.record(tx, payment, seat.applied ? 'payment.authorized.capture_enqueued' : 'payment.authorized.void_enqueued');
    return { outcome: 'PROCESSED', afterCommit: seat.afterCommit };
  }

  async failed(tx: SqlExecutor, payment: PaymentRecord, reason: PaymentFailureReason, code: string): Promise<AppliedOutcome> {
    if (!(await this.payments.transition(tx, payment.id, 'FAILED', code))) return ignored;
    const result = await this.settlement.handler.fail(tx, payment.reservationId, reason);
    if (reason === 'PAYMENT_TIMEOUT') await this.outbox.enqueue(tx, payment.id, 'VOID');
    await this.record(tx, payment, `payment.failed.${reason.toLowerCase()}`);
    return { outcome: 'PROCESSED', afterCommit: result.afterCommit };
  }

  /** Final provider-side settlement. A FAILED payment is only "voided" if an authorization was recorded. */
  async settle(tx: SqlExecutor, payment: PaymentRecord, to: 'CAPTURED' | 'VOIDED'): Promise<AppliedOutcome> {
    if (payment.status === 'FAILED' && !(await this.ledger.has(tx, payment.id, 'AUTHORIZE'))) return ignored;
    if (!(await this.payments.transition(tx, payment.id, to))) return ignored;
    if (to === 'CAPTURED') await this.ledger.append(tx, payment.id, 'CAPTURE');
    else await this.ledger.appendVoid(tx, payment.id);
    await this.record(tx, payment, `payment.${to.toLowerCase()}`);
    return { outcome: 'PROCESSED', afterCommit: noop };
  }

  /** Authorization arrived after we gave up (timeout): record the hold and void it. */
  private async voidLateAuthorization(tx: SqlExecutor, payment: PaymentRecord): Promise<AppliedOutcome> {
    await this.ledger.append(tx, payment.id, 'AUTHORIZE');
    await this.outbox.enqueue(tx, payment.id, 'VOID');
    await this.record(tx, payment, 'payment.late_authorization.void_enqueued');
    return { outcome: 'PROCESSED', afterCommit: noop };
  }

  private async amountMismatch(payment: PaymentRecord, event: ProviderEvent): Promise<AppliedOutcome> {
    this.logger.error({ msg: 'provider amount mismatch; left for reconciliation', paymentId: payment.id, eventId: event.eventId });
    return ignored;
  }

  private record(tx: SqlExecutor, payment: PaymentRecord, action: string): Promise<void> {
    const entry = { actor: 'payment-provider', action, entityType: 'payment', entityId: payment.id, data: { reservationId: payment.reservationId } };
    return this.audit.record(entry, tx);
  }
}
