import { PaymentSummary } from '../../payments/payments.facade';
import { ReservationRecord, ReservationView } from '../domain/reservation.types';

export function toReservationView(r: ReservationRecord, payment: PaymentSummary | null): ReservationView {
  return {
    id: r.id, jameyaId: r.jameyaId, jameyaName: r.jameyaName, seatNumber: r.seatNumber, fee: r.fee,
    monthlyAmount: r.monthlyAmount, currency: 'SAR', status: r.status, expiresAt: r.expiresAt.toISOString(),
    failureReason: r.failureReason, payment, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}
