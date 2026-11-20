import { JameyaListing, Ranking } from '../jameya';
import { explain, SignalName } from './reasons';
import { RankingContext, RankingStrategy, Signals } from './ranking-context';
import { computeSignals } from './signals';

export type Weights = Record<SignalName, number>;

const MAX_REASONS = 3;
const NEUTRAL = 0.5; // value of a personal signal when the member has no preference/history

/**
 * Strategy pattern: one weighted linear model per experiment variant. Score is Σ wᵢ·sᵢ with
 * weights summing to 1, so scores are comparable across variants and always within [0, 1].
 */
export class WeightedRankingStrategy implements RankingStrategy {
  constructor(
    readonly variant: 'control' | 'treatment',
    private readonly weights: Weights,
  ) {}

  rank(jameya: JameyaListing, context: RankingContext): Ranking {
    const signals = computeSignals(jameya, context);
    const contributions = this.contributions(signals);
    const score = contributions.reduce((sum, c) => sum + c.value, 0);
    const reasons = contributions
      .sort((a, b) => b.value - a.value)
      .map((c) => explain(c.name, signals, jameya, context))
      .filter((r): r is string => r !== null)
      .slice(0, MAX_REASONS);
    return { score: Math.round(score * 100) / 100, reasons };
  }

  private contributions(signals: Signals): { name: SignalName; value: number }[] {
    return (Object.keys(this.weights) as SignalName[])
      .filter((name) => this.weights[name] > 0)
      .map((name) => ({ name, value: this.weights[name] * (signals[name] ?? NEUTRAL) }));
  }
}
