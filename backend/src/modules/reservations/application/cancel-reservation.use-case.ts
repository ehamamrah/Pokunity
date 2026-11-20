import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { Errors } from '../../../shared/errors/app-error';
import { AuditFacade } from '../../audit/audit.facade';
import { CatalogFacade } from '../../catalog/catalog.facade';
import { ReservationView } from '../domain/reservation.types';
import { ReservationsRepository } from '../infrastructure/reservations.repository';
import { toReservationView } from './reservation.presenter';
import { assertOwned } from './reservation-errors';

/** Member releases their own HELD seat. Idempotent: an already CANCELLED reservation returns 200. */
@Injectable()
export class CancelReservationUseCase {
  constructor(
    private readonly db: Database,
    private readonly repository: ReservationsRepository,
    private readonly catalog: CatalogFacade,
    private readonly audit: AuditFacade,
  ) {}

  async execute(userId: string, reservationId: string): Promise<ReservationView> {
    const result = await this.db.transaction(async (tx) => {
      const current = assertOwned(await this.repository.lock(tx, reservationId), userId);
      if (current.status === 'CANCELLED') return { record: current, released: false };
      if (current.status !== 'HELD') throw Errors.invalidState(current.status);
      const record = await this.repository.transition(tx, reservationId, 'CANCELLED', { from: ['HELD'] });
      await this.catalog.releaseSeats(tx, [reservationId]);
      await this.audit.record({ actor: userId, action: 'reservation.cancelled', entityType: 'reservation', entityId: reservationId }, tx);
      return { record: record ?? current, released: true };
    });
    if (result.released) await this.catalog.onSeatsChanged([{ jameyaId: result.record.jameyaId, delta: 1 }]);
    return toReservationView(result.record, null);
  }
}
