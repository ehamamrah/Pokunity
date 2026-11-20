import { IntentView } from '../payment-gateway.port';

export type ReconciliationVerdict = 'authorized' | 'failed' | 'timeout' | 'wait';

/**
 * Decides what to do with a payment stuck in AUTHORIZING (no webhook within the grace period),
 * based on the provider's view of the intent.
 *  - provider authorized (webhook lost)  → apply as authorized (confirm seat → capture, or void)
 *  - provider failed                     → apply as declined
 *  - provider has no record / voided     → fail now (nothing to capture)
 *  - still pending                       → wait, until the hard timeout → fail + void
 */
export function decideReconciliation(intent: IntentView | null, timedOut: boolean): ReconciliationVerdict {
  if (!intent || intent.status === 'VOIDED') return 'timeout';
  if (intent.status === 'AUTHORIZED' || intent.status === 'CAPTURED') return 'authorized';
  if (intent.status === 'FAILED') return 'failed';
  return timedOut ? 'timeout' : 'wait';
}
