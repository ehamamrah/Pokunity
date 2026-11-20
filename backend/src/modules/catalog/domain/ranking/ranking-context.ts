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
  rank(jameya: JameyaListing, context: RankingContext): Ranking;
}
