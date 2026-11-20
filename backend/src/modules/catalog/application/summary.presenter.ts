import { Variant } from '../../analytics/domain/experiments';
import { computeBadges } from '../domain/badges';
import { JameyaListing, JameyaSummary, Ranking } from '../domain/jameya';
import { RankingContext } from '../domain/ranking/ranking-context';

/** Maps a listing + its ranking to the contract `JameyaSummary` shape. */
export function toSummary(
  j: JameyaListing,
  ranking: Ranking,
  ctx: RankingContext & { variant: Variant; asOf: Date },
): JameyaSummary {
  return {
    id: j.id, name: j.name, monthlyAmount: j.monthlyAmount, currency: 'SAR',
    durationMonths: j.durationMonths, totalSeats: j.totalSeats, seatsAvailable: j.seatsAvailable,
    payoutAmount: j.monthlyAmount * j.durationMonths, minFee: j.minFee, maxFee: j.maxFee,
    startDate: j.startDate, featured: ctx.featuredIds.has(j.id),
    badges: computeBadges(j, ctx, ctx.variant), ranking, asOf: ctx.asOf.toISOString(),
  };
}
