import { JAMEYA_DEFS } from './fixtures';
import { summaryFor } from './views';

type Summary = ReturnType<typeof summaryFor>;
type SortKey = 'recommended' | 'starting_soon' | 'seats_left' | 'monthly_asc' | 'monthly_desc' | 'newest';

function num(params: URLSearchParams, key: string): number | null {
  const value = params.get(key);
  return value === null || value === '' ? null : Number(value);
}

const COMPARERS: Record<SortKey, (a: Summary, b: Summary) => number> = {
  recommended: (a, b) => b.ranking.score - a.ranking.score,
  starting_soon: (a, b) => a.startDate.localeCompare(b.startDate),
  seats_left: (a, b) => b.seatsAvailable - a.seatsAvailable,
  monthly_asc: (a, b) => a.monthlyAmount - b.monthlyAmount,
  monthly_desc: (a, b) => b.monthlyAmount - a.monthlyAmount,
  newest: (a, b) => b.startDate.localeCompare(a.startDate),
};

function matches(item: Summary, filters: { min: number | null; max: number | null; duration: number | null; q: string; availableOnly: boolean }): boolean {
  if (filters.min !== null && item.monthlyAmount < filters.min) return false;
  if (filters.max !== null && item.monthlyAmount > filters.max) return false;
  if (filters.duration !== null && item.durationMonths !== filters.duration) return false;
  if (filters.q.length >= 2 && !item.name.toLowerCase().includes(filters.q)) return false;
  return !filters.availableOnly || item.seatsAvailable > 0;
}

interface ListFilters {
  min: number | null;
  max: number | null;
  duration: number | null;
  q: string;
  availableOnly: boolean;
}

function listFilters(params: URLSearchParams): ListFilters {
  return {
    min: num(params, 'minMonthly'),
    max: num(params, 'maxMonthly'),
    duration: num(params, 'duration'),
    q: params.get('q')?.trim().toLowerCase() ?? '',
    availableOnly: params.get('availableOnly') !== 'false',
  };
}

function metaFor(page: number, pageSize: number, total: number, nowMs: number) {
  return {
    page,
    pageSize,
    total,
    asOf: new Date(nowMs).toISOString(),
    experiment: { key: 'ranking_v2', variant: 'treatment' as const },
  };
}

/** Applies the contract's list query to the fixture catalogue and paginates the result. */
export function applyListQuery(params: URLSearchParams, nowMs: number) {
  const sort = (params.get('sort') ?? 'recommended') as SortKey;
  const page = num(params, 'page') ?? 1;
  const pageSize = Math.min(50, num(params, 'pageSize') ?? 20);
  const filters = listFilters(params);
  const all = JAMEYA_DEFS.map((def) => summaryFor(def, nowMs))
    .filter((item) => matches(item, filters))
    .sort(COMPARERS[sort]);
  return { data: all.slice((page - 1) * pageSize, page * pageSize), meta: metaFor(page, pageSize, all.length, nowMs) };
}
