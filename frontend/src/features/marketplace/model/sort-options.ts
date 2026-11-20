/**
 * Strategy table for the sort control: each contract sort key carries its own label and
 * the sentence explaining what it optimises for. Adding a sort = adding a row.
 */
export const SORT_OPTIONS = [
  { key: 'recommended', label: 'Recommended', hint: 'Matched to your usual amount and timing.' },
  { key: 'starting_soon', label: 'Starting soon', hint: 'Earliest start date first.' },
  { key: 'seats_left', label: 'Most seats left', hint: 'More room to choose your payout month.' },
  { key: 'monthly_asc', label: 'Lowest monthly amount', hint: 'Smallest monthly contribution first.' },
  { key: 'monthly_desc', label: 'Highest monthly amount', hint: 'Largest monthly contribution first.' },
  { key: 'newest', label: 'Newest', hint: 'Recently published Jameyas first.' },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]['key'];

export const DEFAULT_SORT: SortKey = 'recommended';

export function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((option) => option.key === value);
}

export function sortOptionFor(key: SortKey): (typeof SORT_OPTIONS)[number] {
  const option = SORT_OPTIONS.find((candidate) => candidate.key === key);
  return option ?? SORT_OPTIONS[0];
}
