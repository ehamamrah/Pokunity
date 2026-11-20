import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AuthorizeRequest, IntentView, PaymentGateway } from '../../payment-gateway.port';
import { SimulatorRepository } from './simulator.repository';
import { behaviorOf, TokenBehavior } from './token-behaviors';
import { WebhookDispatcher } from './webhook-dispatcher';

/**
 * Adapter: in-process Payment Provider Simulator behind the PaymentGateway port. Swapping in a
 * real PSP means writing another adapter; nothing else changes.
 */
@Injectable()
export class PaymentSimulatorAdapter extends PaymentGateway implements OnModuleDestroy {
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly intents: SimulatorRepository,
    private readonly webhooks: WebhookDispatcher,
  ) {
    super();
  }

  async authorize(request: AuthorizeRequest): Promise<{ intentId: string }> {
    const behavior = behaviorOf(request.token);
    const initial = behavior.delayMs === 0 ? behavior.outcome : 'PENDING';
    const { intentId, created } = await this.intents.create(request, initial);
    if (created) this.scheduleOutcome(intentId, request.amount, behavior);
    return { intentId };
  }

  async capture(intentId: string): Promise<void> {
    const moved = await this.intents.transition(intentId, 'CAPTURED', ['AUTHORIZED']);
    const current = await this.intents.find({ intentId, reference: '' });
    if (!moved && current?.status !== 'CAPTURED') throw new Error(`cannot capture intent in ${current?.status}`);
    if (moved) this.emit('payment.captured', intentId);
  }

  async void(intentId: string): Promise<void> {
    const moved = await this.intents.transition(intentId, 'VOIDED', ['PENDING', 'AUTHORIZED']);
    const current = await this.intents.find({ intentId, reference: '' });
    if (!moved && current?.status !== 'VOIDED') throw new Error(`cannot void intent in ${current?.status}`);
    if (moved) this.emit('payment.voided', intentId);
  }

  getIntent(lookup: { intentId: string | null; reference: string }): Promise<IntentView | null> {
    return this.intents.find(lookup);
  }

  private scheduleOutcome(intentId: string, amount: number, behavior: TokenBehavior): void {
    if (behavior.delayMs === 0) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.reachOutcome(intentId, amount, behavior).catch(() => undefined);
    }, behavior.delayMs);
    this.timers.add(timer);
  }

  /** Graceful shutdown: pending simulated outcomes are dropped (a real PSP would still deliver). */
  onModuleDestroy(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }

  private async reachOutcome(intentId: string, amount: number, behavior: TokenBehavior): Promise<void> {
    const failure = behavior.failureCode ?? null;
    if (!(await this.intents.transition(intentId, behavior.outcome, ['PENDING'], failure))) return;
    const type = behavior.outcome === 'AUTHORIZED' ? 'payment.authorized' : 'payment.failed';
    this.webhooks.deliver(this.webhooks.buildEvent(type, intentId, amount, failure), behavior.deliveries);
  }

  private emit(type: 'payment.captured' | 'payment.voided', intentId: string): void {
    this.intents
      .amountOf(intentId)
      .then((amount) => this.webhooks.deliver(this.webhooks.buildEvent(type, intentId, amount), 1, 200))
      .catch(() => undefined);
  }
}
