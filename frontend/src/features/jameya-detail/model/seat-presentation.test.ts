import { expect, it } from 'vitest';
import type { Seat } from '@/shared/contract';
import { nearestAvailableSeats } from './nearest-seats';
import { describeSeat, restrictionCopy } from './seat-presentation';
import { markSeatHeld } from './optimistic';

function seat(overrides: Partial<Seat> & Pick<Seat, 'seatNumber'>): Seat {
  return {
    payoutMonth: '2027-06',
    fee: 0,
    status: 'AVAILABLE',
    heldByViewer: false,
    restricted: false,
    restrictionReason: null,
    ...overrides,
  };
}

it('greys out a restricted seat and explains why (RISK_TIER)', () => {
  const view = describeSeat(seat({ seatNumber: 2, restricted: true, restrictionReason: 'RISK_TIER' }), null);
  expect(view.selectable).toBe(false);
  expect(view.kind).toBe('restricted');
  expect(view.detail).toBe('Not open to your risk profile');
  expect(view.detailVisible).toBe(true);
});

it('explains KYC-driven restrictions with the verification copy', () => {
  expect(restrictionCopy('KYC_REQUIRED')).toContain('Verify your identity');
  expect(restrictionCopy('KYC_UNAVAILABLE')).toContain('temporarily unavailable');
});

it("shows the viewer's own hold as \"Your hold\" and not selectable", () => {
  const view = describeSeat(seat({ seatNumber: 5, status: 'HELD', heldByViewer: true }), null);
  expect(view.kind).toBe('yours');
  expect(view.label).toBe('Your hold');
});

it("shows another member's hold as on hold, and taken seats as taken", () => {
  expect(describeSeat(seat({ seatNumber: 7, status: 'HELD' }), null).label).toBe('On hold');
  expect(describeSeat(seat({ seatNumber: 1, status: 'TAKEN' }), null).label).toBe('Taken');
});

it('shows the in-flight seat as holding and gives it precedence', () => {
  const view = describeSeat(seat({ seatNumber: 4 }), 4);
  expect(view.kind).toBe('holding');
  expect(view.selectable).toBe(false);
});

it('only available, unrestricted seats are selectable', () => {
  expect(describeSeat(seat({ seatNumber: 9 }), null).selectable).toBe(true);
});

it('marks only the requested available seat as HELD, leaving the snapshot intact', () => {
  const detail = { seats: [seat({ seatNumber: 1 }), seat({ seatNumber: 2 })] } as Parameters<typeof markSeatHeld>[0];
  const optimistic = markSeatHeld(detail, 2);
  expect(optimistic.seats[1]?.status).toBe('HELD');
  expect(detail.seats[1]?.status).toBe('AVAILABLE');
});

it('suggests the nearest open, unrestricted seats', () => {
  const seats = [
    seat({ seatNumber: 9, status: 'TAKEN' }),
    seat({ seatNumber: 10 }),
    seat({ seatNumber: 12 }),
    seat({ seatNumber: 8, restricted: true, restrictionReason: 'RISK_TIER' }),
    seat({ seatNumber: 7 }),
  ];
  expect(nearestAvailableSeats(seats, 11, 2)).toEqual([10, 12]);
});
