import { Module } from '@nestjs/common';
import { IdempotencyCleanupJob } from './idempotency-cleanup.job';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyRepository } from './infrastructure/idempotency.repository';

/** Owns: idempotency_keys. Public API: IdempotencyInterceptor (use on mutating endpoints). */
@Module({
  providers: [IdempotencyService, IdempotencyRepository, IdempotencyInterceptor, IdempotencyCleanupJob],
  exports: [IdempotencyInterceptor, IdempotencyService],
})
export class IdempotencyModule {}
