import { Module } from '@nestjs/common';
import { AnalyticsFacade } from './analytics.facade';
import { EventsController } from './api/events.controller';
import { AnalyticsRepository } from './infrastructure/analytics.repository';

/** Owns: analytics_events. Provides deterministic A/B assignment. */
@Module({
  controllers: [EventsController],
  providers: [AnalyticsFacade, AnalyticsRepository],
  exports: [AnalyticsFacade],
})
export class AnalyticsModule {}
