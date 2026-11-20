import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock';
import { AnalyticsFacade } from '../../analytics/analytics.facade';
import { ExperimentAssignment, Variant } from '../../analytics/domain/experiments';
import { PersonalizationSignals } from '../../users/domain/user.types';
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

  async forViewer(userId: string, featuredIds: ReadonlySet<string>, asOf: Date): Promise<ViewerRanking> {
    return this.build(userId, await this.users.getPersonalization(userId), featuredIds, asOf);
  }

  /** Synchronous variant when the caller already loaded the member's signals (no extra query). */
  build(userId: string, signals: PersonalizationSignals, featuredIds: ReadonlySet<string>, asOf: Date): ViewerRanking {
    const experiment = this.analytics.rankingExperimentFor(userId);
    const context = {
      now: this.clock.now(), asOf, variant: experiment.variant, featuredIds,
      typicalMonthlyAmount: signals.typicalMonthlyAmount, preferredDurations: signals.preferredDurations,
    };
    return { context, strategy: rankingStrategyFor(experiment.variant), experiment };
  }
}
