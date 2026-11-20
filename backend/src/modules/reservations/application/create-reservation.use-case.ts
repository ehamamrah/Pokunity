import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../../shared/config/app-config';
import { Database } from '../../../shared/database/database.service';
import { SqlExecutor } from '../../../shared/database/sql-executor';
import { Errors } from '../../../shared/errors/app-error';
import { AnalyticsFacade } from '../../analytics/analytics.facade';
import { AuditFacade } from '../../audit/audit.facade';
import { BookingJameya, CatalogFacade } from '../../catalog/catalog.facade';
import { UsersFacade } from '../../users/users.facade';
import { buildLimitsChain, buildReservationChain } from '../domain/preconditions/handlers';
import { ReservationRecord, ReservationView } from '../domain/reservation.types';
import { ReservationsRepository } from '../infrastructure/reservations.repository';
import { toReservationView } from './reservation.presenter';
import { jameyaFull, mapConstraintViolation, seatUnavailable } from './reservation-errors';

interface Command { userId: string; jameyaId: string; seatNumber: number }

/**
 * Places a 5-minute hold. Contract order: (rate limit, idempotency upstream) → eligibility chain →
 * Redis fast-fail gate → atomic PostgreSQL claim (seat UPDATE + reservation INSERT, one transaction).
 */
@Injectable()
export class CreateReservationUseCase {
  private readonly eligibilityChain = buildReservationChain();
  private readonly limitsChain = buildLimitsChain();

  constructor(
    private readonly db: Database, private readonly config: AppConfig, private readonly repository: ReservationsRepository,
    private readonly catalog: CatalogFacade, private readonly users: UsersFacade,
    private readonly analytics: AnalyticsFacade, private readonly audit: AuditFacade,
  ) {}

  async execute(cmd: Command): Promise<ReservationView> {
    const jameya = await this.loadJameya(cmd);
    const maxActiveHolds = await this.checkEligibility(cmd, jameya);
    const gate = await this.catalog.admit(cmd.jameyaId, cmd.seatNumber);
    if (!gate.admitted) throw gate.reason === 'FULL' ? jameyaFull(cmd.jameyaId) : seatUnavailable(cmd.seatNumber);
    const record = await this.claim(cmd, jameya, maxActiveHolds).finally(() => gate.release());
    await this.catalog.onSeatsChanged([{ jameyaId: cmd.jameyaId, delta: -1 }]);
    await this.analytics.trackServerEvent(cmd.userId, 'reservation_created', cmd.jameyaId);
    return toReservationView(record, null);
  }

  private async loadJameya(cmd: Command): Promise<BookingJameya> {
    const jameya = await this.catalog.findForBooking(cmd.jameyaId);
    if (!jameya) throw Errors.notFound('Jameya');
    if (cmd.seatNumber > jameya.totalSeats) throw Errors.notFound(`Seat ${cmd.seatNumber}`);
    return jameya;
  }

  private async checkEligibility(cmd: Command, jameya: BookingJameya): Promise<number> {
    const [eligibility, active] = await Promise.all([
      this.users.getEligibility(cmd.userId), this.repository.activeSummary(this.db, cmd.userId, cmd.jameyaId),
    ]);
    this.eligibilityChain.handle({
      userId: cmd.userId, seatNumber: cmd.seatNumber, totalSeats: jameya.totalSeats, ...eligibility, ...active,
      isSeatRestricted: (tier, seat, total) => this.users.isSeatRestricted(tier, seat, total),
    });
    return eligibility.maxActiveHolds;
  }

  private async claim(cmd: Command, jameya: BookingJameya, maxActiveHolds: number): Promise<ReservationRecord> {
    try {
      return await this.db.transaction((tx) => this.claimInTransaction(tx, cmd, jameya, maxActiveHolds));
    } catch (error) {
      throw mapConstraintViolation(error, cmd.seatNumber);
    }
  }

  private async claimInTransaction(tx: SqlExecutor, cmd: Command, jameya: BookingJameya, maxActiveHolds: number) {
    await this.revalidateLimits(tx, cmd, maxActiveHolds);
    const id = randomUUID();
    const seat = await this.catalog.claimSeat(tx, { ...cmd, reservationId: id });
    if (!seat) throw seatUnavailable(cmd.seatNumber);
    const record = await this.repository.insert(tx, {
      ...cmd, id, jameyaName: jameya.name, fee: seat.fee, monthlyAmount: jameya.monthlyAmount,
      ttlSeconds: this.config.env.HOLD_TTL_SECONDS,
    });
    const data = { jameyaId: cmd.jameyaId, seatNumber: cmd.seatNumber, fee: seat.fee };
    await this.audit.record({ actor: cmd.userId, action: 'reservation.held', entityType: 'reservation', entityId: id, data }, tx);
    return record;
  }

  /** Authoritative re-check under a per-member advisory lock: closes the check-then-act race. */
  private async revalidateLimits(tx: SqlExecutor, cmd: Command, maxActiveHolds: number): Promise<void> {
    await this.repository.lockMember(tx, cmd.userId);
    const active = await this.repository.activeSummary(tx, cmd.userId, cmd.jameyaId);
    this.limitsChain.handle({ ...active, maxActiveHolds });
  }
}
