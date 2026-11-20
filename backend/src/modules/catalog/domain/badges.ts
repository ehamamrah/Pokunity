import { Variant } from '../../analytics/domain/experiments';
import { Badge, JameyaListing } from './jameya';
import { RankingContext } from './ranking/ranking-context';
import { amountMatch, durationMatch } from './ranking/signals';

export const ALMOST_FULL_MAX_SEATS = 2;
export const ALMOST_FULL_MAX_SHARE = 0.2;
export const STARTING_SOON_DAYS = 30;
export const NEW_DAYS = 7;

export function isAlmostFull(j: JameyaListing): boolean {
  if (j.seatsAvailable <= 0) return false;
  return j.seatsAvailable <= ALMOST_FULL_MAX_SEATS || j.seatsAvailable / j.totalSeats <= ALMOST_FULL_MAX_SHARE;
}

/** BEST_MATCH is part of the personalised experience, so only the treatment variant shows it. */
function isBestMatch(j: JameyaListing, ctx: RankingContext, variant: Variant): boolean {
  if (variant !== 'treatment') return false;
  const amount = amountMatch(j.monthlyAmount, ctx.typicalMonthlyAmount) ?? 0;
  return amount >= 0.85 && durationMatch(j.durationMonths, ctx.preferredDurations) === 1;
}

export function computeBadges(j: JameyaListing, ctx: RankingContext, variant: Variant): Badge[] {
  const days = j.base.daysToStart;
  const rules: [Badge, boolean][] = [
    ['FEATURED', ctx.featuredIds.has(j.id)],
    ['ALMOST_FULL', isAlmostFull(j)],
    ['STARTING_SOON', days >= 0 && days <= STARTING_SOON_DAYS],
    ['NEW', j.base.ageDays <= NEW_DAYS],
    ['BEST_MATCH', isBestMatch(j, ctx, variant)],
  ];
  return rules.filter(([, applies]) => applies).map(([badge]) => badge);
}
