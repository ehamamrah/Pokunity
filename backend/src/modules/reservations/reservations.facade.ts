import { Injectable } from '@nestjs/common';
import { Database } from '../../shared/database/database.service';
import { ReservationsRepository } from './infrastructure/reservations.repository';

/** Public API (Facade) of the reservations module for read-side composition. */
@Injectable()
export class ReservationsFacade {
  constructor(
    private readonly db: Database,
    private readonly repository: ReservationsRepository,
  ) {}

  /** Active = HELD or PAYMENT_PENDING (both occupy a hold slot). */
  async activeHoldsCount(userId: string): Promise<number> {
    return (await this.repository.activeSummary(this.db, userId, null)).activeHolds;
  }
}
