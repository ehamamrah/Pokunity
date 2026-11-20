import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Database } from '../../../shared/database/database.service';
import { JobRunner } from '../../../shared/jobs/job-runner';
import { OutboxItem, OutboxRepository } from '../infrastructure/outbox.repository';
import { PaymentsRepository } from '../infrastructure/payments.repository';
import { PaymentGateway } from '../payment-gateway.port';
import { PaymentOutcomeService } from './payment-outcome.service';

/**
 * Transactional Outbox relay: executes CAPTURE / VOID commands that were committed atomically
 * with the seat decision. Provider calls carry an idempotency key, so at-least-once is safe.
 * Failures back off exponentially (2^attempts s, max 5 min) and end in DEAD for manual handling.
 */
@Injectable()
export class OutboxProcessorJob {
  private readonly logger = new Logger(OutboxProcessorJob.name);

  constructor(
    private readonly jobs: JobRunner,
    private readonly db: Database,
    private readonly outbox: OutboxRepository,
    private readonly payments: PaymentsRepository,
    private readonly gateway: PaymentGateway,
    private readonly outcomes: PaymentOutcomeService,
  ) {}

  @Interval(1000)
  tick(): void {
    this.jobs.schedule('payment-outbox', () => this.drain());
  }

  async drain(): Promise<number> {
    const items = await this.outbox.claimDue(20);
    await Promise.all(items.map((item) => this.execute(item)));
    return items.length;
  }

  private async execute(item: OutboxItem): Promise<void> {
    try {
      await this.callProvider(item);
      await this.db.transaction(async (tx) => {
        const payment = await this.payments.lockById(tx, item.paymentId);
        if (payment) await this.outcomes.settle(tx, payment, item.command === 'CAPTURE' ? 'CAPTURED' : 'VOIDED');
        await this.outbox.complete(tx, item.id);
      });
    } catch (error) {
      this.logger.warn({ msg: 'outbox command failed', ...item, error: String(error) });
      await this.outbox.scheduleRetry(item.id, String(error));
    }
  }

  private async callProvider(item: OutboxItem): Promise<void> {
    const payment = await this.payments.findById(item.paymentId);
    const intentId = payment?.providerIntentId;
    const key = `${item.command.toLowerCase()}:${item.paymentId}`;
    if (!intentId) {
      if (item.command === 'CAPTURE') throw new Error('cannot capture: provider intent unknown');
      return; // nothing was ever authorized at the provider
    }
    if (item.command === 'CAPTURE') await this.gateway.capture(intentId, key);
    else await this.gateway.void(intentId, key);
  }
}
