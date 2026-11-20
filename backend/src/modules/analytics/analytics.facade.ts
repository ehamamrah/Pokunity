import { Injectable } from '@nestjs/common';
import { AnalyticsEventDto } from './api/dto/ingest-events.dto';
import { AnalyticsEventRecord, ServerEventType } from './domain/analytics-event';
import { assignVariant, ExperimentAssignment, RANKING_EXPERIMENT } from './domain/experiments';
import { BufferedEventWriter } from './infrastructure/buffered-event-writer';

/** Public API of the analytics module: experiment assignment + event ingestion. */
@Injectable()
export class AnalyticsFacade {
  constructor(private readonly writer: BufferedEventWriter) {}

  rankingExperimentFor(userId: string): ExperimentAssignment {
    return assignVariant(userId, RANKING_EXPERIMENT);
  }

  /**
   * Stores exactly what the client attributed. Events without `experiment` stay unattributed
   * (null), matching docs/marketplace/ab-testing.md; the server-side assignment is deterministic,
   * so analysts can still derive the bucket from user_id when needed.
   */
  ingestClientEvents(userId: string, events: AnalyticsEventDto[]): number {
    const records = events.map((e): AnalyticsEventRecord => ({
      userId, source: 'client', type: e.type, jameyaId: e.jameyaId, position: e.position ?? null,
      surface: e.surface, experimentKey: e.experiment?.key ?? null,
      variant: e.experiment?.variant ?? null, occurredAt: new Date(e.occurredAt),
    }));
    return this.writer.enqueue(records);
  }

  /** Server-side funnel event; buffered, best effort (analytics must never break the booking path). */
  async trackServerEvent(userId: string, type: ServerEventType, jameyaId: string): Promise<void> {
    const { key, variant } = this.rankingExperimentFor(userId);
    const record: AnalyticsEventRecord = {
      userId, source: 'server', type, jameyaId, position: null, surface: null,
      experimentKey: key, variant, occurredAt: new Date(),
    };
    this.writer.enqueue([record]);
  }
}
