import { expect, it } from 'vitest';
import { countActiveFilters, DEFAULT_FILTERS, parseFilters, toListQuery, toSearchParams } from './filters';
import { nextPageParam, positionOf } from './paging';

const META = { page: 3, pageSize: 20, total: 90, asOf: '2026-11-21T10:00:00.000Z' };

it('round-trips filters through the URL, omitting defaults', () => {
  const params = new URLSearchParams('q=Riyadh&minMonthly=50000&maxMonthly=150000&duration=12&availableOnly=0&sort=seats_left');
  const filters = parseFilters(params);
  expect(filters).toEqual({ q: 'Riyadh', minMonthly: 50000, maxMonthly: 150000, duration: 12, availableOnly: false, sort: 'seats_left' });
  expect(toSearchParams(filters).toString()).toBe(params.toString());
});

it('ignores invalid values and falls back to defaults', () => {
  const filters = parseFilters(new URLSearchParams('sort=hacked&minMonthly=-5&duration=0'));
  expect(filters).toEqual(DEFAULT_FILTERS);
  expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe('');
});

it('sends the search only once it is at least two characters', () => {
  expect(toListQuery({ ...DEFAULT_FILTERS, q: 'a' }, 1, 20).q).toBeUndefined();
  expect(toListQuery({ ...DEFAULT_FILTERS, q: 'Ri' }, 2, 20)).toMatchObject({ q: 'Ri', page: 2, pageSize: 20 });
});

it('counts active filters for the clear control', () => {
  expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
  expect(countActiveFilters({ ...DEFAULT_FILTERS, availableOnly: false, duration: 10 })).toBe(2);
});

it('numbers positions across pages from 1', () => {
  expect(positionOf(META, 0)).toBe(41);
});

it('returns the next page only while more results exist', () => {
  expect(nextPageParam({ ...META, page: 1, total: 45 })).toBe(2);
  expect(nextPageParam({ ...META, total: 45 })).toBeUndefined();
});
