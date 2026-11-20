import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { JobRunner } from '../../shared/jobs/job-runner';
import { IdempotencyRepository } from './infrastructure/idempotency.repository';

/** Purges idempotency records past their 24h retention. */
@Injectable()
export class IdempotencyCleanupJob {
  private readonly logger = new Logger(IdempotencyCleanupJob.name);

  constructor(
    private readonly jobs: JobRunner,
    private readonly repository: IdempotencyRepository,
  ) {}

  @Interval(10 * 60 * 1000)
  tick(): void {
    this.jobs.schedule('idempotency-cleanup', async () => {
      const purged = await this.repository.purgeExpired();
      if (purged > 0) this.logger.log({ msg: 'purged idempotency keys', purged });
    });
  }
}
