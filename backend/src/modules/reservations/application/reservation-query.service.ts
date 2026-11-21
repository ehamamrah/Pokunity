import { Injectable } from '@nestjs/common';
import { PaymentsFacade } from '../../payments/payments.facade';
import { ReservationStatus, ReservationView } from '../domain/reservation.types';
import { ReservationsRepository } from '../infrastructure/reservations.repository';
import { toReservationView } from './reservation.presenter';
import { assertOwned } from './reservation-errors';

export interface ReservationPage {
  data: ReservationView[];
  meta: { page: number; pageSize: number; total: number };
}

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

  /** Constant queries regardless of page size: one for the page + total, one for its payments. */
  async list(userId: string, q: { statuses: ReservationStatus[] | null; page: number; pageSize: number }): Promise<ReservationPage> {
    const page = { limit: q.pageSize, offset: (q.page - 1) * q.pageSize };
    const { records, total } = await this.repository.pageByUser(userId, q.statuses, page);
    const payments = await this.payments.summariesFor(records.map((r) => r.id));
    const data = records.map((r) => toReservationView(r, payments.get(r.id) ?? null));
    return { data, meta: { page: q.page, pageSize: q.pageSize, total } };
  }
}
