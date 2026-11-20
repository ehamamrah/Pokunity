import { canTransition, isActive, isTerminal, RESERVATION_TRANSITIONS, sourcesOf } from './reservation-state-machine';
import { ReservationStatus } from './reservation.types';

const ALL = Object.keys(RESERVATION_TRANSITIONS) as ReservationStatus[];

test('allows exactly the contract lifecycle transitions', () => {
  const allowed = ALL.flatMap((from) => ALL.filter((to) => canTransition(from, to)).map((to) => `${from}>${to}`));
  expect(allowed.sort()).toEqual([
    'HELD>CANCELLED', 'HELD>CONFIRMED', 'HELD>EXPIRED', 'HELD>PAYMENT_PENDING',
    'PAYMENT_PENDING>CONFIRMED', 'PAYMENT_PENDING>FAILED',
  ]);
});

test('PAYMENT_PENDING can never expire (sweeper guarantee)', () => {
  expect(canTransition('PAYMENT_PENDING', 'EXPIRED')).toBe(false);
  expect(sourcesOf('EXPIRED')).toEqual(['HELD']);
});

test('terminal statuses have no exits and are not active', () => {
  for (const s of ['CONFIRMED', 'EXPIRED', 'CANCELLED', 'FAILED'] as ReservationStatus[]) {
    expect(isTerminal(s)).toBe(true);
    expect(isActive(s)).toBe(false);
  }
  expect(isActive('HELD') && isActive('PAYMENT_PENDING')).toBe(true);
});

test('confirmation is reachable from HELD (zero fee) and PAYMENT_PENDING only', () => {
  expect(sourcesOf('CONFIRMED').sort()).toEqual(['HELD', 'PAYMENT_PENDING']);
});
