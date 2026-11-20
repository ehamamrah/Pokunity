import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { SqlExecutor } from '../../../shared/database/sql-executor';
import { Errors } from '../../../shared/errors/app-error';
import { AuditFacade } from '../../audit/audit.facade';
import { AuthorizationRequest, PaymentsFacade, PaymentSummary } from '../../payments/payments.facade';
import { ReservationRecord, ReservationView } from '../domain/reservation.types';
import { ReservationsRepository } from '../infrastructure/reservations.repository';
import { toReservationView } from './reservation.presenter';
import { assertOwned, reservationExpired } from './reservation-errors';
import { ReservationSettlementService } from './reservation-settlement.service';

interface Command { userId: string; reservationId: string; paymentMethodToken: string }
export interface CheckoutResult { httpStatus: 200 | 202; body: ReservationView }

type TxOutcome =
  | { kind: 'free'; record: ReservationRecord; afterCommit: () => Promise<void> }
  | { kind: 'paid'; record: ReservationRecord; payment: PaymentSummary; request: AuthorizationRequest };

/**
 * HELD → PAYMENT_PENDING (conditional on expires_at > now()) + payment AUTHORIZING in ONE
 * transaction; the provider is called only after commit. Zero-fee seats confirm immediately.
 */
@Injectable()
export class CheckoutUseCase {
  constructor(
    private readonly db: Database,
    private readonly repository: ReservationsRepository,
    private readonly payments: PaymentsFacade,
    private readonly settlement: ReservationSettlementService,
    private readonly audit: AuditFacade,
  ) {}

  async execute(cmd: Command): Promise<CheckoutResult> {
    const outcome = await this.db.transaction((tx) => this.startCheckout(tx, cmd));
    if (outcome.kind === 'free') {
      await outcome.afterCommit();
      return { httpStatus: 200, body: toReservationView(outcome.record, null) };
    }
    await this.payments.requestAuthorization(outcome.payment.id, outcome.request);
    return { httpStatus: 202, body: toReservationView(outcome.record, outcome.payment) };
  }

  private async startCheckout(tx: SqlExecutor, cmd: Command): Promise<TxOutcome> {
    const current = assertOwned(await this.repository.lock(tx, cmd.reservationId), cmd.userId);
    if (current.status === 'EXPIRED') throw reservationExpired(current.id);
    if (current.status !== 'HELD') throw Errors.invalidState(current.status);
    if (current.fee === 0) return this.confirmFree(tx, current);
    const record = await this.repository.transition(tx, current.id, 'PAYMENT_PENDING', { requireUnexpired: true });
    if (!record) throw reservationExpired(current.id);
    const request = { reservationId: record.id, userId: cmd.userId, amount: record.fee, token: cmd.paymentMethodToken };
    const payment = await this.payments.open(tx, request);
    await this.audit.record({ actor: cmd.userId, action: 'reservation.checkout_started', entityType: 'reservation', entityId: record.id, data: { paymentId: payment.id } }, tx);
    return { kind: 'paid', record, payment, request };
  }

  private async confirmFree(tx: SqlExecutor, current: ReservationRecord): Promise<TxOutcome> {
    const result = await this.settlement.confirmFromHold(tx, current.id);
    if (!result.record) throw reservationExpired(current.id);
    return { kind: 'free', record: result.record, afterCommit: result.afterCommit };
  }
}
