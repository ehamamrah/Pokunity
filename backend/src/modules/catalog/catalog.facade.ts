import { Injectable } from '@nestjs/common';
import { SqlExecutor } from '../../shared/database/sql-executor';
import { AvailabilityGateService, GateDecision } from './application/availability-gate.service';
import { BookingJameya, JameyasRepository } from './infrastructure/jameyas.repository';
import { SeatsRepository } from './infrastructure/seats.repository';

export type { BookingJameya } from './infrastructure/jameyas.repository';
export type { GateDecision } from './application/availability-gate.service';

/**
 * Public API of the catalog module for the booking path. Seat mutations take the caller's
 * transaction executor (Unit of Work) so the seat and the reservation change atomically,
 * while the SQL against catalog-owned tables stays inside this module.
 */
@Injectable()
export class CatalogFacade {
  constructor(
    private readonly jameyas: JameyasRepository,
    private readonly seats: SeatsRepository,
    private readonly gate: AvailabilityGateService,
  ) {}

  findForBooking(jameyaId: string): Promise<BookingJameya | null> {
    return this.jameyas.findForBooking(jameyaId);
  }

  admit(jameyaId: string, seatNumber: number): Promise<GateDecision> {
    return this.gate.admit(jameyaId, seatNumber);
  }

  claimSeat(tx: SqlExecutor, claim: { jameyaId: string; seatNumber: number; reservationId: string; userId: string }) {
    return this.seats.claim(tx, claim.jameyaId, claim.seatNumber, claim.reservationId, claim.userId);
  }

  releaseSeats(tx: SqlExecutor, reservationIds: string[]): Promise<string[]> {
    return this.seats.release(tx, reservationIds);
  }

  markSeatTaken(tx: SqlExecutor, reservationId: string): Promise<boolean> {
    return this.seats.markTaken(tx, reservationId);
  }

  /** Call after commit: keeps the fast-fail counter close to the truth (-1 claim, +1 release). */
  async onSeatsChanged(changes: { jameyaId: string; delta: number }[]): Promise<void> {
    await Promise.all(changes.map((c) => this.gate.adjust(c.jameyaId, c.delta)));
  }
}
