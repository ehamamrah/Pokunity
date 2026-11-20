import { Module } from '@nestjs/common';
import { AnalyticsFacade } from './analytics.facade';
import { EventsController } from './api/events.controller';
import { AnalyticsRepository } from './infrastructure/analytics.repository';
import { BufferedEventWriter } from './infrastructure/buffered-event-writer';

/** Owns: analytics_events. Provides deterministic A/B assignment. */
@Module({
  controllers: [EventsController],
  providers: [AnalyticsFacade, AnalyticsRepository, BufferedEventWriter],
  exports: [AnalyticsFacade, BufferedEventWriter],
})
export class AnalyticsModule {}
