import { JameyaListing, Ranking } from '../jameya';
import { explain, SignalName } from './reasons';
import { RankingContext, RankingStrategy, Signals } from './ranking-context';
import { amountMatch, computeSignals, durationMatch } from './signals';

export type Weights = Record<SignalName, number>;

const MAX_REASONS = 3;
const NEUTRAL = 0.5; // value of a personal signal when the member has no preference/history
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Strategy pattern: one weighted linear model per experiment variant. Score is Σ wᵢ·sᵢ with
 * weights summing to 1, so scores are comparable across variants and always within [0, 1].
 */
export class WeightedRankingStrategy implements RankingStrategy {
  constructor(
    readonly variant: 'control' | 'treatment',
    private readonly weights: Weights,
  ) {}

  /** Hot path: no allocations, base signals are precomputed on the listing. */
  score(j: JameyaListing, ctx: RankingContext): number {
    const w = this.weights;
    const personal = w.amountMatch === 0 && w.durationMatch === 0 ? 0
      : w.amountMatch * (amountMatch(j.monthlyAmount, ctx.typicalMonthlyAmount) ?? NEUTRAL)
        + w.durationMatch * (durationMatch(j.durationMonths, ctx.preferredDurations) ?? NEUTRAL);
    const b = j.base;
    return round2(personal + w.scarcity * b.scarcity + w.startingSoon * b.startingSoon
      + w.freshness * b.freshness + w.featured * b.featured);
  }

  rank(jameya: JameyaListing, context: RankingContext): Ranking {
    const signals = computeSignals(jameya, context);
    const reasons = this.contributions(signals)
      .sort((a, b) => b.value - a.value)
      .map((c) => explain(c.name, signals, jameya, context))
      .filter((r): r is string => r !== null)
      .slice(0, MAX_REASONS);
    return { score: this.score(jameya, context), reasons };
  }

  private contributions(signals: Signals): { name: SignalName; value: number }[] {
    return (Object.keys(this.weights) as SignalName[])
      .filter((name) => this.weights[name] > 0)
      .map((name) => ({ name, value: this.weights[name] * (signals[name] ?? NEUTRAL) }));
  }
}
