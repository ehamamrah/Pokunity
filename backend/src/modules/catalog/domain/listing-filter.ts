import { JameyaListing } from './jameya';

export interface ListingFilter {
  minMonthly?: number;
  maxMonthly?: number;
  duration?: number;
  q?: string;
  availableOnly: boolean;
}

type Spec = (j: JameyaListing) => boolean;

/** Specification pattern: each active filter contributes one predicate; all must hold. */
export function buildFilterSpec(filter: ListingFilter): Spec {
  const needle = filter.q?.trim().toLowerCase();
  const specs: (Spec | false)[] = [
    filter.minMonthly !== undefined && ((j) => j.monthlyAmount >= (filter.minMonthly as number)),
    filter.maxMonthly !== undefined && ((j) => j.monthlyAmount <= (filter.maxMonthly as number)),
    filter.duration !== undefined && ((j) => j.durationMonths === filter.duration),
    !!needle && ((j) => j.name.toLowerCase().includes(needle as string)),
    filter.availableOnly && ((j) => j.seatsAvailable > 0),
  ];
  const active = specs.filter((s): s is Spec => s !== false);
  return (j) => active.every((spec) => spec(j));
}
