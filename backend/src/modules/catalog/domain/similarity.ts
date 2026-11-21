import { JameyaListing } from './jameya';

export const SIMILAR_LIMIT = 5;
export const SIMILAR_DURATION_DELTA = 2;
export const SIMILAR_AMOUNT_SHARE = 0.25;

/** Specification: open (not full, not started) and close in duration and monthly amount. */
export function isSimilar(target: JameyaListing, candidate: JameyaListing): boolean {
  return candidate.id !== target.id
    && candidate.seatsAvailable > 0
    && candidate.base.daysToStart > 0
    && Math.abs(candidate.durationMonths - target.durationMonths) <= SIMILAR_DURATION_DELTA
    && Math.abs(candidate.monthlyAmount - target.monthlyAmount) <= target.monthlyAmount * SIMILAR_AMOUNT_SHARE;
}

/** Closest start date first; the viewer's ranking variant breaks ties (then id, for stability). */
export function findSimilar(target: JameyaListing, listings: JameyaListing[], score: (j: JameyaListing) => number): JameyaListing[] {
  const distance = (j: JameyaListing) => Math.abs(j.base.daysToStart - target.base.daysToStart);
  return listings
    .filter((candidate) => isSimilar(target, candidate))
    .map((jameya) => ({ jameya, distance: distance(jameya), score: score(jameya) }))
    .sort((a, b) => a.distance - b.distance || b.score - a.score || a.jameya.id.localeCompare(b.jameya.id))
    .slice(0, SIMILAR_LIMIT)
    .map((r) => r.jameya);
}
