import { JameyaListing } from './jameya';

export const SORT_KEYS = ['recommended', 'starting_soon', 'seats_left', 'monthly_asc', 'monthly_desc', 'newest'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface Ranked {
  jameya: JameyaListing;
  score: number;
}

type Comparator = (a: Ranked, b: Ranked) => number;

const byId: Comparator = (a, b) => a.jameya.id.localeCompare(b.jameya.id);
const then = (primary: Comparator): Comparator => (a, b) => primary(a, b) || byId(a, b);

/** Strategy pattern: one comparator per sort option; ties broken by id for stable pagination. */
export const SORT_STRATEGIES: Record<SortKey, Comparator> = {
  recommended: then((a, b) => b.score - a.score),
  starting_soon: then((a, b) => a.jameya.startDate.localeCompare(b.jameya.startDate)),
  seats_left: then((a, b) => a.jameya.seatsAvailable - b.jameya.seatsAvailable),
  monthly_asc: then((a, b) => a.jameya.monthlyAmount - b.jameya.monthlyAmount),
  monthly_desc: then((a, b) => b.jameya.monthlyAmount - a.jameya.monthlyAmount),
  newest: then((a, b) => b.jameya.createdAt.getTime() - a.jameya.createdAt.getTime()),
};
