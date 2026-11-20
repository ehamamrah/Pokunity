import { expect, it } from 'vitest';
import { ApiError, API_ERROR_CODES, NetworkError, type ApiErrorCode } from '@/shared/api-client';
import { describeReservationError } from './error-strategy';

function apiError(code: ApiErrorCode, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}): ApiError {
  return new ApiError({ status: 409, code, message: 'server text', traceId: 'trace-9', ...extra });
}

it('refreshes the seat map and suggests nearby seats on SEAT_UNAVAILABLE', () => {
  const presentation = describeReservationError(apiError('SEAT_UNAVAILABLE', { details: { seatNumber: 11 } }), { suggestedSeats: [10, 12] });
  expect(presentation.title).toBe('That seat was just taken');
  expect(presentation.message).toContain('Seat 11');
  expect(presentation.message).toContain('Nearest open seats: 10, 12.');
  expect(presentation.action).toEqual({ kind: 'refresh' });
});

it('links to the existing hold on ACTIVE_RESERVATION_EXISTS', () => {
  const presentation = describeReservationError(apiError('ACTIVE_RESERVATION_EXISTS', { details: { reservationId: 'r-1' } }));
  expect(presentation.action).toEqual({ kind: 'link', href: '/reservations/r-1', label: 'View your hold' });
});

it('respects Retry-After on RATE_LIMITED', () => {
  const presentation = describeReservationError(apiError('RATE_LIMITED', { status: 429, retryAfterSeconds: 4 }));
  expect(presentation.action).toEqual({ kind: 'wait', seconds: 4 });
});

it('never shows the raw server message and keeps the trace id for support', () => {
  const presentation = describeReservationError(apiError('INTERNAL_ERROR', { status: 500 }));
  expect(presentation.message).not.toContain('server text');
  expect(presentation.reference).toBe('trace-9');
});

it('describes network loss without claiming a charge happened', () => {
  const presentation = describeReservationError(new NetworkError());
  expect(presentation.title).toBe('Connection problem');
  expect(presentation.reference).toBeNull();
});

it.each(API_ERROR_CODES)('has user-facing copy for %s', (code) => {
  const presentation = describeReservationError(apiError(code, { status: 400 }), { jameyaHref: '/jameyas/x' });
  expect(presentation.title.length).toBeGreaterThan(0);
  expect(presentation.message.length).toBeGreaterThan(0);
});
