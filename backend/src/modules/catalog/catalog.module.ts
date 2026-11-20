import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { UsersModule } from '../users/users.module';
import { JameyasController } from './api/jameyas.controller';
import { AvailabilityGateService } from './application/availability-gate.service';
import { CatalogSnapshotService } from './application/catalog-snapshot.service';
import { GateRebuildJob } from './application/gate-rebuild.job';
import { JameyaDetailService } from './application/jameya-detail.service';
import { MarketplaceService } from './application/marketplace.service';
import { RankingContextFactory } from './application/ranking-context.factory';
import { SeatMapCache } from './application/seat-map.cache';
import { CatalogFacade } from './catalog.facade';
import { JameyasRepository } from './infrastructure/jameyas.repository';
import { SeatsRepository } from './infrastructure/seats.repository';

/** Owns: jameyas, seats, featured_campaigns. */
@Module({
  imports: [UsersModule, AnalyticsModule],
  controllers: [JameyasController],
  providers: [
    CatalogFacade, MarketplaceService, JameyaDetailService, CatalogSnapshotService, RankingContextFactory,
    AvailabilityGateService, GateRebuildJob, SeatMapCache, JameyasRepository, SeatsRepository,
  ],
  exports: [CatalogFacade],
})
export class CatalogModule {}
