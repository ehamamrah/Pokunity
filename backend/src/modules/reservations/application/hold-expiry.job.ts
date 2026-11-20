import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Database } from '../../../shared/database/database.service';
import { JobRunner } from '../../../shared/jobs/job-runner';
import { AuditFacade } from '../../audit/audit.facade';
import { CatalogFacade } from '../../catalog/catalog.facade';
import { UsersFacade } from '../../users/users.facade';
import { ReservationsRepository } from '../infrastructure/reservations.repository';

export const SWEEP_BATCH_SIZE = 500;

/**
 * Expiry sweeper (every 5 s, one instance cluster-wide via advisory lock). Expires ONLY
 * status = 'HELD' AND expires_at < now() in SKIP LOCKED batches, releases their seats and
 * updates behaviour counters — all in one transaction per batch. PAYMENT_PENDING is never touched.
 */
@Injectable()
export class HoldExpiryJob {
  private readonly logger = new Logger(HoldExpiryJob.name);

  constructor(
    private readonly jobs: JobRunner, private readonly db: Database,
    private readonly repository: ReservationsRepository, private readonly catalog: CatalogFacade,
    private readonly users: UsersFacade, private readonly audit: AuditFacade,
  ) {}

  @Interval(5000)
  tick(): void {
    this.jobs.schedule('hold-expiry', () => this.jobs.exclusive('hold-expiry', () => this.sweep()));
  }

  /** Returns the number of holds expired. Loops until a batch comes back short. */
  async sweep(): Promise<number> {
    let total = 0;
    for (let expired = SWEEP_BATCH_SIZE; expired === SWEEP_BATCH_SIZE; total += expired) {
      expired = await this.sweepBatch();
    }
    if (total > 0) this.logger.log({ msg: 'expired holds', total });
    return total;
  }

  private async sweepBatch(): Promise<number> {
    const { count, jameyaIds } = await this.db.transaction(async (tx) => {
      const expired = await this.repository.expireDue(tx, SWEEP_BATCH_SIZE);
      if (expired.length === 0) return { count: 0, jameyaIds: [] as string[] };
      const released = await this.catalog.releaseSeats(tx, expired.map((r) => r.id));
      await this.users.recordExpiredHolds(tx, expired.map((r) => r.userId));
      const data = { reservationIds: expired.map((r) => r.id) };
      await this.audit.record({ actor: 'system', action: 'reservation.expired_batch', entityType: 'reservation', entityId: 'batch', data }, tx);
      return { count: expired.length, jameyaIds: released };
    });
    await this.catalog.onSeatsChanged(jameyaIds.map((jameyaId) => ({ jameyaId, delta: 1 })));
    return count;
  }
}
