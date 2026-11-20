import { Variant } from '../../../analytics/domain/experiments';
import { RankingStrategy } from './ranking-context';
import { Weights, WeightedRankingStrategy } from './weighted-ranking.strategy';

/** Control: non-personalised baseline (scarcity, timing, merchandising). */
export const CONTROL_WEIGHTS: Weights = {
  amountMatch: 0,
  durationMatch: 0,
  scarcity: 0.35,
  startingSoon: 0.3,
  freshness: 0.15,
  featured: 0.2,
};

/** Treatment (ranking_v2): personal fit dominates, urgency and merchandising still count. */
export const TREATMENT_WEIGHTS: Weights = {
  amountMatch: 0.35,
  durationMatch: 0.2,
  scarcity: 0.15,
  startingSoon: 0.15,
  freshness: 0.05,
  featured: 0.1,
};

const strategies: Record<Variant, RankingStrategy> = {
  control: new WeightedRankingStrategy('control', CONTROL_WEIGHTS),
  treatment: new WeightedRankingStrategy('treatment', TREATMENT_WEIGHTS),
};

/** Factory: picks the ranking strategy for the member's A/B variant. */
export function rankingStrategyFor(variant: Variant): RankingStrategy {
  return strategies[variant];
}
