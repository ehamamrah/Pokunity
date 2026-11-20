import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppConfig } from '../../../shared/config/app-config';
import { Database } from '../../../shared/database/database.service';
import { JobRunner } from '../../../shared/jobs/job-runner';
import { decideReconciliation, ReconciliationVerdict } from '../domain/reconciliation-policy';
import { ProviderEvent } from '../domain/payment.types';
import { PaymentEventsRepository } from '../infrastructure/payment-events.repository';
import { PaymentsRepository, StalePayment } from '../infrastructure/payments.repository';
import { PaymentGateway } from '../payment-gateway.port';
import { AppliedOutcome, PaymentOutcomeService } from './payment-outcome.service';
import { WebhookService } from './webhook.service';

/**
 * Recovers from lost/late webhooks and crashes between commit and provider call:
 *  - AUTHORIZING payments older than PAYMENT_RECONCILE_AFTER_SECONDS are checked with the provider;
 *  - after PAYMENT_TIMEOUT_SECONDS without authorization they fail (PAYMENT_TIMEOUT) and are voided;
 *  - orphan events (unknown intent at arrival) are retried.
 * Synthetic decisions are recorded in payment_events (`recon_*`) for the audit trail and dedup.
 */
@Injectable()
export class ReconciliationJob {
  private readonly logger = new Logger(ReconciliationJob.name);

  constructor(
    private readonly jobs: JobRunner,
    private readonly config: AppConfig,
    private readonly db: Database,
    private readonly payments: PaymentsRepository,
    private readonly events: PaymentEventsRepository,
    private readonly gateway: PaymentGateway,
    private readonly outcomes: PaymentOutcomeService,
    private readonly webhooks: WebhookService,
  ) {}

  @Interval(10_000)
  tick(): void {
    this.jobs.schedule('payment-reconciliation', () => this.jobs.exclusive('payment-reconciliation', () => this.run()));
  }

  async run(): Promise<void> {
    const { PAYMENT_RECONCILE_AFTER_SECONDS: after, PAYMENT_TIMEOUT_SECONDS: timeout } = this.config.env;
    const stale = await this.payments.findStaleAuthorizing(after, timeout, 50);
    for (const payment of stale) await this.reconcile(payment);
    for (const orphan of await this.events.findOrphans(50)) await this.webhooks.retryOrphan(orphan);
  }

  async reconcile(payment: StalePayment): Promise<ReconciliationVerdict> {
    const intent = await this.gateway.getIntent({ intentId: payment.providerIntentId, reference: payment.id });
    if (intent && !payment.providerIntentId) await this.payments.setIntent(payment.id, intent.intentId);
    const verdict = decideReconciliation(intent, payment.timedOut);
    if (verdict !== 'wait') await this.apply(payment.id, verdict, intent?.intentId ?? 'none');
    this.logger.log({ msg: 'payment reconciled', paymentId: payment.id, verdict });
    return verdict;
  }

  private async apply(paymentId: string, verdict: Exclude<ReconciliationVerdict, 'wait'>, intentId: string): Promise<void> {
    const result = await this.db.transaction(async (tx) => {
      const payment = await this.payments.lockById(tx, paymentId);
      if (payment?.status !== 'AUTHORIZING') return null;
      await this.events.insertIfNew(tx, syntheticEvent(paymentId, verdict, intentId, payment.amount), 'PROCESSED');
      const actions: Record<typeof verdict, () => Promise<AppliedOutcome>> = {
        authorized: () => this.outcomes.authorized(tx, payment),
        failed: () => this.outcomes.failed(tx, payment, 'PAYMENT_DECLINED', 'PROVIDER_FAILED'),
        timeout: () => this.outcomes.failed(tx, payment, 'PAYMENT_TIMEOUT', 'PAYMENT_TIMEOUT'),
      };
      return actions[verdict]();
    });
    if (result) await result.afterCommit();
  }
}

function syntheticEvent(paymentId: string, verdict: string, intentId: string, amount: number): ProviderEvent {
  const type = verdict === 'authorized' ? 'payment.authorized' : 'payment.failed';
  return {
    eventId: `recon_${paymentId}_${verdict}`, type, paymentIntentId: intentId, amount, currency: 'SAR',
    occurredAt: new Date().toISOString(), failureCode: verdict === 'authorized' ? null : verdict.toUpperCase(),
  };
}
