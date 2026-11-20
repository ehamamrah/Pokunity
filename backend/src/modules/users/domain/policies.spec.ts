import { maxActiveHolds } from './hold-limit-policy';
import { isSeatRestricted, restrictedSeatCount } from './risk-policy';

test('HIGH risk members cannot take the earliest 30% of seats (rounded up)', () => {
  expect(restrictedSeatCount('HIGH', 12)).toBe(4);
  expect(isSeatRestricted('HIGH', 4, 12)).toBe(true);
  expect(isSeatRestricted('HIGH', 5, 12)).toBe(false);
  expect(restrictedSeatCount('HIGH', 6)).toBe(2);
});

test('LOW and MEDIUM risk members have no seat restriction', () => {
  expect(isSeatRestricted('LOW', 1, 12)).toBe(false);
  expect(isSeatRestricted('MEDIUM', 1, 12)).toBe(false);
});

test('members with many expired holds are limited to one active hold', () => {
  expect(maxActiveHolds(0)).toBe(3);
  expect(maxActiveHolds(2)).toBe(3);
  expect(maxActiveHolds(3)).toBe(1);
  expect(maxActiveHolds(6)).toBe(1);
});
