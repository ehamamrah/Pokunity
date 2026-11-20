import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock';
import { AnalyticsFacade } from '../../analytics/analytics.facade';
import { ExperimentAssignment, Variant } from '../../analytics/domain/experiments';
import { UsersFacade } from '../../users/users.facade';
import { RankingContext, RankingStrategy } from '../domain/ranking/ranking-context';
import { rankingStrategyFor } from '../domain/ranking/ranking-strategies';

export interface ViewerRanking {
  context: RankingContext & { variant: Variant; asOf: Date };
  strategy: RankingStrategy;
  experiment: ExperimentAssignment;
}

/** Factory: assembles the per-viewer ranking context (signals + A/B variant + strategy). */
@Injectable()
export class RankingContextFactory {
  constructor(
    private readonly users: UsersFacade,
    private readonly analytics: AnalyticsFacade,
    private readonly clock: Clock,
  ) {}

  async forViewer(userId: string, featuredIds: string[], asOf: Date): Promise<ViewerRanking> {
    const signals = await this.users.getPersonalization(userId);
    const experiment = this.analytics.rankingExperimentFor(userId);
    const context = {
      now: this.clock.now(), asOf, variant: experiment.variant, featuredIds: new Set(featuredIds),
      typicalMonthlyAmount: signals.typicalMonthlyAmount, preferredDurations: signals.preferredDurations,
    };
    return { context, strategy: rankingStrategyFor(experiment.variant), experiment };
  }
}
