import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppConfig } from '../../../../shared/config/app-config';
import { ProviderEvent, ProviderEventType } from '../../domain/payment.types';
import { signPayload } from '../../domain/webhook-signature';

const MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const newEventId = () => `evt_${randomBytes(12).toString('hex')}`;

/** Simulated provider → merchant webhook delivery: HMAC-signed, retried with backoff on failure. */
@Injectable()
export class WebhookDispatcher {
  private readonly logger = new Logger('payment-simulator');

  constructor(private readonly config: AppConfig) {}

  buildEvent(type: ProviderEventType, intentId: string, amount: number, failureCode: string | null = null): ProviderEvent {
    return {
      eventId: newEventId(), type, paymentIntentId: intentId, amount, currency: 'SAR',
      occurredAt: new Date().toISOString(), failureCode,
    };
  }

  /** Delivers the same event `times` times (duplicates share the eventId). Fire and forget. */
  deliver(event: ProviderEvent, times = 1, delayMs = 0): void {
    if (!this.config.env.SIMULATOR_AUTO_WEBHOOKS || times <= 0) return;
    const run = async () => {
      await sleep(delayMs);
      // Duplicates are delivered concurrently to exercise the eventId uniqueness race.
      await Promise.all(Array.from({ length: times }, () => this.send(event, 1)));
    };
    void run();
  }

  private async send(event: ProviderEvent, attempt: number): Promise<void> {
    const body = JSON.stringify(event);
    const signature = signPayload(body, this.config.env.PAYMENT_WEBHOOK_SECRET);
    const ok = await fetch(this.config.env.PAYMENT_WEBHOOK_URL, {
      method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Pokunity-Signature': signature },
    }).then((r) => r.ok, () => false);
    this.logger.log({ msg: 'webhook delivered', eventId: event.eventId, type: event.type, ok, attempt });
    if (ok || attempt >= MAX_ATTEMPTS) return;
    await sleep(500 * 2 ** attempt);
    await this.send(event, attempt + 1);
  }
}
