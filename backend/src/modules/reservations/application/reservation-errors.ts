import { AppError, Errors } from '../../../shared/errors/app-error';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { isPgError, PgErrorCode } from '../../../shared/database/sql-executor';
import { ReservationRecord } from '../domain/reservation.types';

export const seatUnavailable = (seatNumber: number) =>
  new AppError(ErrorCode.SEAT_UNAVAILABLE, `Seat ${seatNumber} is no longer available.`, { seatNumber });

export const jameyaFull = (jameyaId: string) =>
  new AppError(ErrorCode.JAMEYA_FULL, 'This Jameya has no seats left.', { jameyaId });

export const reservationExpired = (id: string) =>
  new AppError(ErrorCode.RESERVATION_EXPIRED, 'The seat hold expired before checkout. Please reserve again.', { reservationId: id });

/** Loads-and-authorises: 404 for unknown ids, 403 for someone else's reservation. */
export function assertOwned(r: ReservationRecord | null, userId: string): ReservationRecord {
  if (!r) throw Errors.notFound('Reservation');
  if (r.userId !== userId) throw Errors.forbidden();
  return r;
}

/** Last line of defence: DB partial unique indexes translated into contract errors. */
export function mapConstraintViolation(error: unknown, seatNumber: number): unknown {
  if (isPgError(error, PgErrorCode.UniqueViolation, 'reservations_active_user_jameya_uq')) {
    return new AppError(ErrorCode.ACTIVE_RESERVATION_EXISTS, 'You already have an active reservation in this Jameya.');
  }
  if (isPgError(error, PgErrorCode.UniqueViolation, 'reservations_live_seat_uq')) return seatUnavailable(seatNumber);
  return error;
}
