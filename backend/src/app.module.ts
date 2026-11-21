import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountModule } from './modules/account/account.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HealthModule } from './modules/health/health.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { UsersModule } from './modules/users/users.module';
import { GlobalRateLimitMiddleware } from './shared/http/rate-limit/global-rate-limit.middleware';
import { SharedModule } from './shared/shared.module';

/** Modular monolith composition root. API and background jobs run in the same process. */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    SharedModule,
    AuditModule,
    AnalyticsModule,
    IdempotencyModule,
    UsersModule,
    AuthModule,
    CatalogModule,
    PaymentsModule,
    ReservationsModule,
    AccountModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Request context is installed first at the Express level (bootstrap.ts), before body parsing.
    consumer.apply(GlobalRateLimitMiddleware).forRoutes('{*splat}');
  }
}
