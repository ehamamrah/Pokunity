import { expect, it } from 'vitest';
import { resolveByLabel } from './resolve-by';

it('returns no label when there is no deadline', () => {
  expect(resolveByLabel(null)).toBeNull();
  expect(resolveByLabel(undefined)).toBeNull();
});

it('returns no label for a malformed deadline instead of showing "Invalid Date"', () => {
  expect(resolveByLabel('not-a-date')).toBeNull();
});

it('formats a valid deadline as a clock time', () => {
  const label = resolveByLabel('2026-11-21T10:10:00.000Z');
  expect(label).toMatch(/^\d{2}:\d{2}$/);
});
