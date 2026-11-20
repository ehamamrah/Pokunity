import { DEFAULT_SORT, isSortKey, type SortKey } from './sort-options';

export const MIN_SEARCH_LENGTH = 2;
export const DURATION_OPTIONS = [6, 10, 12, 18, 24] as const;

export interface MarketplaceFilters {
  readonly q: string;
  /** Minor units, inclusive (contract `minMonthly`). */
  readonly minMonthly: number | null;
  readonly maxMonthly: number | null;
  readonly duration: number | null;
  readonly availableOnly: boolean;
  readonly sort: SortKey;
}

export const DEFAULT_FILTERS: MarketplaceFilters = {
  q: '',
  minMonthly: null,
  maxMonthly: null,
  duration: null,
  availableOnly: true,
  sort: DEFAULT_SORT,
};

/** Minimal read-only view of URLSearchParams, so the parser is pure and testable. */
export interface QueryReader {
  get(name: string): string | null;
}

export function isSearchable(q: string): boolean {
  return q.trim().length >= MIN_SEARCH_LENGTH;
}

function readNonNegativeInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function readPositiveInt(value: string | null): number | null {
  const parsed = readNonNegativeInt(value);
  return parsed === null || parsed === 0 ? null : parsed;
}

export function parseFilters(params: QueryReader): MarketplaceFilters {
  const sortParam = params.get('sort');
  return {
    q: params.get('q') ?? '',
    minMonthly: readNonNegativeInt(params.get('minMonthly')),
    maxMonthly: readNonNegativeInt(params.get('maxMonthly')),
    duration: readPositiveInt(params.get('duration')),
    availableOnly: params.get('availableOnly') !== '0',
    sort: isSortKey(sortParam) ? sortParam : DEFAULT_SORT,
  };
}

/** Serialises only non-default values so shareable URLs stay short. */
export function toSearchParams(filters: MarketplaceFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.minMonthly !== null) params.set('minMonthly', String(filters.minMonthly));
  if (filters.maxMonthly !== null) params.set('maxMonthly', String(filters.maxMonthly));
  if (filters.duration !== null) params.set('duration', String(filters.duration));
  if (!filters.availableOnly) params.set('availableOnly', '0');
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);
  return params;
}

export function countActiveFilters(filters: MarketplaceFilters): number {
  const checks = [
    isSearchable(filters.q),
    filters.minMonthly !== null,
    filters.maxMonthly !== null,
    filters.duration !== null,
    !filters.availableOnly,
  ];
  return checks.filter(Boolean).length;
}

export function isAmountRangeValid(min: number | null, max: number | null): boolean {
  return min === null || max === null || min <= max;
}

export function toListQuery(filters: MarketplaceFilters, page: number, pageSize: number) {
  return {
    sort: filters.sort,
    minMonthly: filters.minMonthly,
    maxMonthly: filters.maxMonthly,
    duration: filters.duration,
    q: isSearchable(filters.q) ? filters.q.trim() : undefined,
    availableOnly: filters.availableOnly,
    page,
    pageSize,
  };
}
