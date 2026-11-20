import { assignVariant, bucketOf } from '../../../analytics/domain/experiments';
import { computeBadges } from '../badges';
import { JameyaListing, payoutMonth } from '../jameya';
import { RankingContext } from './ranking-context';
import { baseSignalsOf } from './signals';
import { CONTROL_WEIGHTS, rankingStrategyFor, TREATMENT_WEIGHTS } from './ranking-strategies';

const now = new Date('2026-11-21T10:00:00.000Z');

function listing(overrides: Partial<JameyaListing> = {}, featured: ReadonlySet<string> = new Set(['j1'])): JameyaListing {
  const row = {
    id: 'j1', name: 'Riyadh Savers 12M', monthlyAmount: 100000, durationMonths: 12, totalSeats: 12,
    seatsAvailable: 2, minFee: 0, maxFee: 36000, startDate: '2026-12-01', createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
  return { ...row, base: baseSignalsOf(row, now, featured) };
}

function context(overrides: Partial<RankingContext> = {}): RankingContext {
  return { now, typicalMonthlyAmount: 100000, preferredDurations: [10, 12], featuredIds: new Set(['j1']), ...overrides };
}

test('weights of every variant sum to 1 so scores stay in [0, 1]', () => {
  const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
  expect(sum(CONTROL_WEIGHTS)).toBeCloseTo(1);
  expect(sum(TREATMENT_WEIGHTS)).toBeCloseTo(1);
});

test('treatment explains a personal match with human-readable reasons', () => {
  const ranking = rankingStrategyFor('treatment').rank(listing(), context());
  expect(ranking.score).toBeGreaterThan(0.8);
  expect(ranking.reasons[0]).toBe('Matches your usual monthly amount');
  expect(ranking.reasons).toContain('Matches your preferred 12-month duration');
  expect(ranking.reasons.length).toBeLessThanOrEqual(3);
});

test('treatment ranks a matching Jameya above a mismatched one; control ignores preferences', () => {
  const match = listing({}, new Set());
  const mismatch = listing({ id: 'j2', monthlyAmount: 500000, durationMonths: 24, totalSeats: 24, seatsAvailable: 4 }, new Set());
  const ctx = context({ featuredIds: new Set() });
  const t = rankingStrategyFor('treatment');
  expect(t.rank(match, ctx).score).toBeGreaterThan(t.rank(mismatch, ctx).score);
  const c = rankingStrategyFor('control').rank(match, ctx);
  expect(c.reasons.some((r) => r.startsWith('Matches'))).toBe(false);
});

test('members without preferences get neutral personal signals', () => {
  const ranking = rankingStrategyFor('treatment').rank(listing(), context({ typicalMonthlyAmount: null, preferredDurations: [] }));
  expect(ranking.score).toBeGreaterThan(0);
  expect(ranking.reasons.some((r) => r.startsWith('Matches'))).toBe(false);
});

test('badges: featured, almost full, starting soon; BEST_MATCH only in treatment', () => {
  expect(computeBadges(listing(), context(), 'treatment')).toEqual(['FEATURED', 'ALMOST_FULL', 'STARTING_SOON', 'BEST_MATCH']);
  expect(computeBadges(listing(), context(), 'control')).toEqual(['FEATURED', 'ALMOST_FULL', 'STARTING_SOON']);
  const fresh = listing({ createdAt: '2026-11-19T00:00:00.000Z', seatsAvailable: 8, startDate: '2027-04-01' }, new Set());
  expect(computeBadges(fresh, context({ featuredIds: new Set() }), 'control')).toEqual(['NEW']);
});

test('A/B assignment is deterministic and roughly balanced', () => {
  expect(assignVariant('user-42')).toEqual(assignVariant('user-42'));
  expect(bucketOf('user-42', 'ranking_v2')).toBe(bucketOf('user-42', 'ranking_v2'));
  const treated = Array.from({ length: 2000 }, (_, i) => assignVariant(`user-${i}`).variant === 'treatment').filter(Boolean).length;
  expect(treated).toBeGreaterThan(900);
  expect(treated).toBeLessThan(1100);
});

test('score() equals the score reported by rank() for every variant', () => {
  for (const variant of ['control', 'treatment'] as const) {
    const strategy = rankingStrategyFor(variant);
    const j = listing({ monthlyAmount: 120000, durationMonths: 10, seatsAvailable: 5 });
    expect(strategy.score(j, context())).toBe(strategy.rank(j, context()).score);
  }
});

test('payout month advances one month per seat across year boundaries', () => {
  expect(payoutMonth('2026-12-01', 1)).toBe('2026-12');
  expect(payoutMonth('2026-12-01', 2)).toBe('2027-01');
  expect(payoutMonth('2026-12-15', 12)).toBe('2027-11');
});
