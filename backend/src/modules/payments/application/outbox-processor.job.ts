import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Database } from '../../../shared/database/database.service';
import { JobRunner } from '../../../shared/jobs/job-runner';
import { OutboxItem, OutboxRepository } from '../infrastructure/outbox.repository';
import { PaymentsRepository } from '../infrastructure/payments.repository';
import { PaymentGateway } from '../payment-gateway.port';
import { PaymentOutcomeService } from './payment-outcome.service';

/**
 * Transactional Outbox relay: executes AUTHORIZE / CAPTURE / VOID commands that were committed
 * atomically with the business decision. Provider calls are idempotent (our payment id is the key),
 * so at-least-once delivery is safe. Failures back off exponentially (2^attempts s, max 5 min) and
 * end in DEAD for manual handling. `kick()` lets the request path trigger an immediate drain.
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

  /** Fire-and-forget drain right after a commit (no-op if a drain is already running). */
  kick(): void {
    this.tick();
  }

  async drain(): Promise<number> {
    const items = await this.outbox.claimDue(20);
    await Promise.all(items.map((item) => this.execute(item)));
    return items.length;
  }

  private async execute(item: OutboxItem): Promise<void> {
    try {
      await (item.command === 'AUTHORIZE' ? this.authorize(item) : this.settle(item));
    } catch (error) {
      this.logger.warn({ msg: 'outbox command failed', id: item.id, command: item.command, error: String(error) });
      await this.outbox.scheduleRetry(item.id, String(error));
    }
  }

  private async authorize(item: OutboxItem): Promise<void> {
    if (item.paymentStatus === 'AUTHORIZING') {
      const { intentId } = await this.gateway.authorize({ reference: item.paymentId, amount: item.amount, currency: 'SAR', token: item.token });
      await this.payments.setIntent(item.paymentId, intentId);
    }
    await this.outbox.complete(this.db, item.id);
  }

  private async settle(item: OutboxItem): Promise<void> {
    await this.callProvider(item);
    await this.db.transaction(async (tx) => {
      const payment = await this.payments.lockById(tx, item.paymentId);
      if (payment) await this.outcomes.settle(tx, payment, item.command === 'CAPTURE' ? 'CAPTURED' : 'VOIDED');
      await this.outbox.complete(tx, item.id);
    });
  }

  private async callProvider(item: OutboxItem): Promise<void> {
    const key = `${item.command.toLowerCase()}:${item.paymentId}`;
    if (!item.intentId) {
      if (item.command === 'CAPTURE') throw new Error('cannot capture: provider intent unknown');
      return; // nothing was ever authorized at the provider
    }
    if (item.command === 'CAPTURE') await this.gateway.capture(item.intentId, key);
    else await this.gateway.void(item.intentId, key);
  }
}
