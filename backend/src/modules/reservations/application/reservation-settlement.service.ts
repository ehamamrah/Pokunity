import { Injectable, OnModuleInit } from '@nestjs/common';
import { SqlExecutor } from '../../../shared/database/sql-executor';
import { AnalyticsFacade } from '../../analytics/analytics.facade';
import { AuditFacade } from '../../audit/audit.facade';
import { CatalogFacade } from '../../catalog/catalog.facade';
import { PaymentFailureReason, PaymentsFacade, ReservationSettlement, SettlementOutcome } from '../../payments/payments.facade';
import { UsersFacade } from '../../users/users.facade';
import { ReservationRecord, ReservationStatus } from '../domain/reservation.types';
import { ReservationsRepository } from '../infrastructure/reservations.repository';

/** Thrown when a reservation was confirmed but its seat was not HELD by it: roll back, never capture. */
export class SeatInvariantViolation extends Error {}

/**
 * Implements the payments module's ReservationSettlement port. All methods run inside the
 * caller's transaction; seat and reservation change together or not at all.
 */
@Injectable()
export class ReservationSettlementService implements ReservationSettlement, OnModuleInit {
  constructor(
    private readonly repository: ReservationsRepository, private readonly catalog: CatalogFacade,
    private readonly users: UsersFacade, private readonly payments: PaymentsFacade,
    private readonly analytics: AnalyticsFacade, private readonly audit: AuditFacade,
  ) {}

  onModuleInit(): void {
    this.payments.registerSettlement(this);
  }

  /** PAYMENT_PENDING → CONFIRMED and seat HELD → TAKEN (payment authorized). */
  async confirm(tx: SqlExecutor, reservationId: string): Promise<SettlementOutcome> {
    const { record, afterCommit } = await this.confirmFrom(tx, reservationId);
    return { applied: record !== null, afterCommit };
  }

  /** HELD → CONFIRMED for zero-fee seats (still conditional on the hold being unexpired). */
  confirmFromHold(tx: SqlExecutor, reservationId: string) {
    return this.confirmFrom(tx, reservationId, true);
  }

  async fail(tx: SqlExecutor, reservationId: string, reason: PaymentFailureReason): Promise<SettlementOutcome> {
    const record = await this.repository.transition(tx, reservationId, 'FAILED', { failureReason: reason });
    if (!record) return { applied: false, afterCommit: async () => undefined };
    await this.catalog.releaseSeats(tx, [record.id]);
    await this.record(tx, record, `reservation.failed.${reason.toLowerCase()}`);
    return { applied: true, afterCommit: () => this.catalog.onSeatsChanged([{ jameyaId: record.jameyaId, delta: 1 }]) };
  }

  private async confirmFrom(tx: SqlExecutor, reservationId: string, fromHold = false) {
    const from: ReservationStatus[] = fromHold ? ['HELD'] : ['PAYMENT_PENDING'];
    const record = await this.repository.transition(tx, reservationId, 'CONFIRMED', { requireUnexpired: fromHold, from });
    if (!record) return { record: null, afterCommit: async () => undefined };
    if (!(await this.catalog.markSeatTaken(tx, record.id))) throw new SeatInvariantViolation(`seat of ${record.id} not held`);
    await this.users.recordConfirmedReservation(tx, record.userId, record.monthlyAmount);
    await this.record(tx, record, 'reservation.confirmed');
    const afterCommit = async () => {
      await this.catalog.onSeatsChanged([{ jameyaId: record.jameyaId, delta: 0 }]);
      await this.analytics.trackServerEvent(record.userId, 'reservation_confirmed', record.jameyaId);
    };
    return { record, afterCommit };
  }

  private record(tx: SqlExecutor, r: ReservationRecord, action: string): Promise<void> {
    const data = { jameyaId: r.jameyaId, seatNumber: r.seatNumber, fee: r.fee };
    return this.audit.record({ actor: 'system', action, entityType: 'reservation', entityId: r.id, data }, tx);
  }
}
