import { expect, it } from 'vitest';
import { formatAgo, formatCountdown, formatStartDate, remainingMs, secondsSince } from './time';

const ASOF = '2026-11-21T10:00:00.000Z';

it('formats the hold window as mm:ss and never shows 00:00 while time remains', () => {
  expect(formatCountdown(300_000)).toBe('05:00');
  expect(formatCountdown(299_400)).toBe('05:00');
  expect(formatCountdown(59_500)).toBe('01:00');
  expect(formatCountdown(400)).toBe('00:01');
});

it('measures seconds since the server asOf timestamp, never negative', () => {
  expect(secondsSince(ASOF, Date.parse('2026-11-21T10:00:07.500Z'))).toBe(7);
  expect(secondsSince(ASOF, Date.parse('2026-11-21T09:59:59.000Z'))).toBe(0);
});

it('phrases the age for the indicator', () => {
  expect(formatAgo(0)).toBe('just now');
  expect(formatAgo(12)).toBe('12s ago');
  expect(formatAgo(125)).toBe('2m ago');
});

it('computes remaining hold time and clamps at zero', () => {
  expect(remainingMs('2026-11-21T10:05:00.000Z', Date.parse('2026-11-21T10:04:00.000Z'))).toBe(60_000);
  expect(remainingMs('2026-11-21T10:05:00.000Z', Date.parse('2026-11-21T10:06:00.000Z'))).toBe(0);
});

it('formats start dates in UTC so they do not shift by timezone', () => {
  expect(formatStartDate('2026-12-01')).toBe('1 Dec 2026');
});
