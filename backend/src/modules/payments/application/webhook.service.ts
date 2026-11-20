import { Injectable, Logger } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { ProviderEvent } from '../domain/payment.types';
import { PaymentEventsRepository } from '../infrastructure/payment-events.repository';
import { PaymentsRepository } from '../infrastructure/payments.repository';
import { AppliedOutcome, PaymentOutcomeService } from './payment-outcome.service';

/**
 * Processes provider events exactly once: event insert (dedup by eventId), payment row lock,
 * conditional transitions and outbox enqueue all commit in ONE transaction.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly db: Database,
    private readonly events: PaymentEventsRepository,
    private readonly payments: PaymentsRepository,
    private readonly outcomes: PaymentOutcomeService,
  ) {}

  async receive(event: ProviderEvent): Promise<{ received: true; duplicate: boolean }> {
    const result = await this.db.transaction(async (tx) => {
      if (!(await this.events.insertIfNew(tx, event))) return null;
      const payment = await this.payments.lockByIntent(tx, event.paymentIntentId);
      const applied: AppliedOutcome = payment
        ? await this.outcomes.apply(tx, payment, event)
        : { outcome: 'ORPHAN', afterCommit: async () => undefined };
      await this.events.markOutcome(tx, event.eventId, applied.outcome);
      return applied;
    });
    if (result) await result.afterCommit();
    this.logger.log({ msg: 'provider event', eventId: event.eventId, type: event.type, outcome: result?.outcome ?? 'DUPLICATE' });
    return { received: true, duplicate: result === null };
  }

  /** Re-attempts an orphan (event that arrived before we knew its intent id). */
  async retryOrphan(event: ProviderEvent): Promise<boolean> {
    const result = await this.db.transaction(async (tx) => {
      const payment = await this.payments.lockByIntent(tx, event.paymentIntentId);
      if (!payment) return null;
      const applied = await this.outcomes.apply(tx, payment, event);
      await this.events.markOutcome(tx, event.eventId, 'ORPHAN_RESOLVED');
      return applied;
    });
    if (result) await result.afterCommit();
    return result !== null;
  }
}
