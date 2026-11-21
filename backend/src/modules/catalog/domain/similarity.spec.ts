import { JameyaListing } from './jameya';
import { findSimilar } from './similarity';
import { baseSignalsOf } from './ranking/signals';

const now = new Date('2026-11-21T00:00:00Z');
function listing(id: string, overrides: Partial<JameyaListing> = {}): JameyaListing {
  const row = {
    id, name: id, monthlyAmount: 100000, durationMonths: 12, totalSeats: 12, seatsAvailable: 4, minFee: 0, maxFee: 0,
    startDate: '2027-01-01', createdAt: '2026-11-01T00:00:00.000Z', ...overrides,
  };
  return { ...row, base: baseSignalsOf(row, now, new Set()) };
}

test('similar = open, duration ±2, amount ±25%, excluding self, full and started', () => {
  const target = listing('t');
  const pool = [
    target, listing('ok'), listing('full', { seatsAvailable: 0 }), listing('started', { startDate: '2026-11-01' }),
    listing('long', { durationMonths: 15 }), listing('pricey', { monthlyAmount: 130000 }), listing('edge', { monthlyAmount: 125000, durationMonths: 10 }),
  ];
  expect(findSimilar(target, pool, () => 0).map((j) => j.id).sort()).toEqual(['edge', 'ok']);
});

test('closest start date first, ranking score breaks ties, at most 5', () => {
  const target = listing('t');
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => listing(id, { startDate: i < 2 ? '2027-01-01' : '2027-03-01' }));
  const scores: Record<string, number> = { a: 0.2, b: 0.9 };
  const ids = findSimilar(target, pool, (j) => scores[j.id] ?? 0).map((j) => j.id);
  expect(ids).toEqual(['b', 'a', 'c', 'd', 'e']);
});
