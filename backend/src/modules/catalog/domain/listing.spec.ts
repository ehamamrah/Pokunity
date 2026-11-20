import { JameyaListing } from './jameya';
import { buildFilterSpec } from './listing-filter';
import { Ranked, SORT_STRATEGIES } from './sort-strategies';

const base: JameyaListing = {
  id: 'a', name: 'Riyadh Savers 12M', monthlyAmount: 100000, durationMonths: 12, totalSeats: 12, seatsAvailable: 3,
  minFee: 0, maxFee: 1000, startDate: '2026-12-01', createdAt: new Date('2026-11-01T00:00:00Z'),
};
const items: JameyaListing[] = [
  base,
  { ...base, id: 'b', name: 'Jeddah Circle 10M', monthlyAmount: 120000, durationMonths: 10, seatsAvailable: 0, startDate: '2026-12-15' },
  { ...base, id: 'c', name: 'Dammam Unity 6M', monthlyAmount: 50000, durationMonths: 6, seatsAvailable: 5, createdAt: new Date('2026-11-20T00:00:00Z') },
];

test('filters combine as a conjunction of specifications', () => {
  const ids = (f: Parameters<typeof buildFilterSpec>[0]) => items.filter(buildFilterSpec(f)).map((j) => j.id);
  expect(ids({ availableOnly: true })).toEqual(['a', 'c']);
  expect(ids({ availableOnly: false, maxMonthly: 100000 })).toEqual(['a', 'c']);
  expect(ids({ availableOnly: false, minMonthly: 110000 })).toEqual(['b']);
  expect(ids({ availableOnly: false, duration: 6 })).toEqual(['c']);
  expect(ids({ availableOnly: false, q: 'jed' })).toEqual(['b']);
});

test('sort strategies order deterministically', () => {
  const ranked: Ranked[] = items.map((jameya, i) => ({ jameya, score: [0.5, 0.9, 0.7][i] }));
  const order = (key: keyof typeof SORT_STRATEGIES) => [...ranked].sort(SORT_STRATEGIES[key]).map((r) => r.jameya.id);
  expect(order('recommended')).toEqual(['b', 'c', 'a']);
  expect(order('monthly_asc')).toEqual(['c', 'a', 'b']);
  expect(order('monthly_desc')).toEqual(['b', 'a', 'c']);
  expect(order('seats_left')).toEqual(['b', 'a', 'c']);
  expect(order('newest')[0]).toBe('c');
  expect(order('starting_soon')).toEqual(['a', 'c', 'b']);
});
