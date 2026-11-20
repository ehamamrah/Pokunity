import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';
import { ReservationsController } from './api/reservations.controller';
import { CancelReservationUseCase } from './application/cancel-reservation.use-case';
import { CheckoutUseCase } from './application/checkout.use-case';
import { CreateReservationUseCase } from './application/create-reservation.use-case';
import { HoldExpiryJob } from './application/hold-expiry.job';
import { ReservationQueryService } from './application/reservation-query.service';
import { ReservationSettlementService } from './application/reservation-settlement.service';
import { ReservationsRepository } from './infrastructure/reservations.repository';
import { ReservationsFacade } from './reservations.facade';

/** Owns: reservations. Implements the payments module's ReservationSettlement port. */
@Module({
  imports: [CatalogModule, UsersModule, PaymentsModule, AnalyticsModule, AuditModule, IdempotencyModule],
  controllers: [ReservationsController],
  providers: [
    ReservationsFacade, CreateReservationUseCase, CheckoutUseCase, CancelReservationUseCase,
    ReservationQueryService, ReservationSettlementService, HoldExpiryJob, ReservationsRepository,
  ],
  exports: [ReservationsFacade, HoldExpiryJob],
})
export class ReservationsModule {}
