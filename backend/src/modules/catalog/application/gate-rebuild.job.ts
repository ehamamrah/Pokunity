import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { JobRunner } from '../../../shared/jobs/job-runner';
import { AvailabilityGateService } from './availability-gate.service';

/** Every 10 s, re-derives Redis gate counters from PostgreSQL (corrects any drift). */
@Injectable()
export class GateRebuildJob {
  private readonly logger = new Logger(GateRebuildJob.name);

  constructor(
    private readonly jobs: JobRunner,
    private readonly gate: AvailabilityGateService,
  ) {}

  @Interval(10_000)
  tick(): void {
    this.jobs.schedule('gate-rebuild', () =>
      this.jobs.exclusive('gate-rebuild', async () => {
        const rebuilt = await this.gate.rebuild();
        this.logger.debug({ msg: 'gate counters rebuilt', rebuilt });
      }),
    );
  }
}
