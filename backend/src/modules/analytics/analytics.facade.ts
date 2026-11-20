import { Injectable, Logger } from '@nestjs/common';
import { Database } from '../../shared/database/database.service';
import { AnalyticsEventDto } from './api/dto/ingest-events.dto';
import { AnalyticsEventRecord, ServerEventType } from './domain/analytics-event';
import { assignVariant, ExperimentAssignment, RANKING_EXPERIMENT } from './domain/experiments';
import { AnalyticsRepository } from './infrastructure/analytics.repository';

/** Public API of the analytics module: experiment assignment + event ingestion. */
@Injectable()
export class AnalyticsFacade {
  private readonly logger = new Logger(AnalyticsFacade.name);

  constructor(
    private readonly db: Database,
    private readonly repository: AnalyticsRepository,
  ) {}

  rankingExperimentFor(userId: string): ExperimentAssignment {
    return assignVariant(userId, RANKING_EXPERIMENT);
  }

  /**
   * Stores exactly what the client attributed. Events without `experiment` stay unattributed
   * (null), matching docs/marketplace/ab-testing.md; the server-side assignment is deterministic,
   * so analysts can still derive the bucket from user_id when needed.
   */
  async ingestClientEvents(userId: string, events: AnalyticsEventDto[]): Promise<number> {
    const records = events.map((e): AnalyticsEventRecord => ({
      userId, source: 'client', type: e.type, jameyaId: e.jameyaId, position: e.position ?? null,
      surface: e.surface, experimentKey: e.experiment?.key ?? null,
      variant: e.experiment?.variant ?? null, occurredAt: new Date(e.occurredAt),
    }));
    return this.repository.insertMany(this.db, records);
  }

  /** Server-side funnel event; best effort (analytics must never break the booking path). */
  async trackServerEvent(userId: string, type: ServerEventType, jameyaId: string): Promise<void> {
    const { key, variant } = this.rankingExperimentFor(userId);
    const record: AnalyticsEventRecord = {
      userId, source: 'server', type, jameyaId, position: null, surface: null,
      experimentKey: key, variant, occurredAt: new Date(),
    };
    await this.repository.insertMany(this.db, [record]).catch((error: Error) =>
      this.logger.warn({ msg: 'server event dropped', type, error: error.message }),
    );
  }
}
