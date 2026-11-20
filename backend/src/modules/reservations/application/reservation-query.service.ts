import { Injectable } from '@nestjs/common';
import { PaymentsFacade } from '../../payments/payments.facade';
import { ReservationStatus, ReservationView } from '../domain/reservation.types';
import { ReservationsRepository } from '../infrastructure/reservations.repository';
import { toReservationView } from './reservation.presenter';
import { assertOwned } from './reservation-errors';

/** Authoritative (never cached) reservation reads; the checkout polling target. */
@Injectable()
export class ReservationQueryService {
  constructor(
    private readonly repository: ReservationsRepository,
    private readonly payments: PaymentsFacade,
  ) {}

  async get(userId: string, reservationId: string): Promise<ReservationView> {
    const record = assertOwned(await this.repository.findById(reservationId), userId);
    const payments = await this.payments.summariesFor([record.id]);
    return toReservationView(record, payments.get(record.id) ?? null);
  }

  async list(userId: string, statuses: ReservationStatus[] | null): Promise<ReservationView[]> {
    const records = await this.repository.listByUser(userId, statuses);
    const payments = await this.payments.summariesFor(records.map((r) => r.id));
    return records.map((r) => toReservationView(r, payments.get(r.id) ?? null));
  }
}
