import { JameyaListing, Ranking } from '../jameya';

export interface RankingContext {
  now: Date;
  typicalMonthlyAmount: number | null;
  preferredDurations: number[];
  featuredIds: ReadonlySet<string>;
}

/** Normalised [0..1] signals for one Jameya, shared by all strategies. */
export interface Signals {
  amountMatch: number | null;
  durationMatch: number | null;
  scarcity: number;
  startingSoon: number;
  freshness: number;
  featured: number;
}

export interface RankingStrategy {
  readonly variant: 'control' | 'treatment';
  /** Score only (hot path: called for every candidate, allocation-free). */
  score(jameya: JameyaListing, context: RankingContext): number;
  /** Score plus human-readable reasons (called for the returned page only). */
  rank(jameya: JameyaListing, context: RankingContext): Ranking;
}
