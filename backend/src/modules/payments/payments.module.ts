import { Module } from '@nestjs/common';
import { BreakerRegistry } from '../../shared/resilience/breaker-registry';
import { AuditModule } from '../audit/audit.module';
import { PaymentsWebhookController } from './api/payments-webhook.controller';
import { WebhookSignatureGuard } from './api/webhook-signature.guard';
import { OutboxProcessorJob } from './application/outbox-processor.job';
import { PaymentOutcomeService } from './application/payment-outcome.service';
import { ReconciliationJob } from './application/reconciliation.job';
import { WebhookService } from './application/webhook.service';
import { LedgerRepository } from './infrastructure/ledger.repository';
import { OutboxRepository } from './infrastructure/outbox.repository';
import { PaymentEventsRepository } from './infrastructure/payment-events.repository';
import { PaymentsRepository } from './infrastructure/payments.repository';
import { ResilientPaymentGateway } from './infrastructure/resilient-payment-gateway';
import { PaymentSimulatorAdapter } from './infrastructure/simulator/payment-simulator.adapter';
import { SimulatorRepository } from './infrastructure/simulator/simulator.repository';
import { WebhookDispatcher } from './infrastructure/simulator/webhook-dispatcher';
import { PaymentGateway } from './payment-gateway.port';
import { PaymentsFacade } from './payments.facade';
import { SettlementRegistry } from './settlement.port';

/** Owns: payments, payment_events, ledger_entries, payment_outbox, simulator_payment_intents. */
@Module({
  imports: [AuditModule],
  controllers: [PaymentsWebhookController],
  providers: [
    PaymentsFacade, SettlementRegistry, WebhookService, PaymentOutcomeService, OutboxProcessorJob,
    ReconciliationJob, WebhookSignatureGuard, PaymentsRepository, PaymentEventsRepository,
    LedgerRepository, OutboxRepository, SimulatorRepository, WebhookDispatcher,
    PaymentSimulatorAdapter,
    {
      provide: PaymentGateway,
      inject: [PaymentSimulatorAdapter, BreakerRegistry],
      useFactory: (adapter: PaymentSimulatorAdapter, breakers: BreakerRegistry) =>
        new ResilientPaymentGateway(adapter, breakers.get('paymentGateway', { failureThreshold: 5, openDurationMs: 10_000 })),
    },
  ],
  exports: [PaymentsFacade, OutboxProcessorJob, ReconciliationJob],
})
export class PaymentsModule {}
