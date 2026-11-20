import { IntentStatus } from '../../payment-gateway.port';

export interface TokenBehavior {
  /** Outcome the provider eventually reaches. */
  outcome: Extract<IntentStatus, 'AUTHORIZED' | 'FAILED'>;
  /** Delay before the outcome is reached (ms). */
  delayMs: number;
  /** How many times the outcome webhook is delivered (0 = never). */
  deliveries: number;
  failureCode?: string;
}

/** Contract test tokens (docs/api/README.md#payment-test-tokens). */
export const TOKEN_BEHAVIORS: Record<string, TokenBehavior> = {
  tok_success: { outcome: 'AUTHORIZED', delayMs: 1000, deliveries: 1 },
  tok_decline: { outcome: 'FAILED', delayMs: 1000, deliveries: 1, failureCode: 'INSUFFICIENT_FUNDS' },
  tok_slow: { outcome: 'AUTHORIZED', delayMs: 8000, deliveries: 1 },
  tok_duplicate: { outcome: 'AUTHORIZED', delayMs: 1000, deliveries: 3 },
  // Provider authorizes but the webhook is lost: only reconciliation (getIntent) can discover it.
  tok_timeout: { outcome: 'AUTHORIZED', delayMs: 0, deliveries: 0 },
};

export const UNKNOWN_TOKEN_BEHAVIOR: TokenBehavior = {
  outcome: 'FAILED', delayMs: 500, deliveries: 1, failureCode: 'CARD_DECLINED',
};

export function behaviorOf(token: string): TokenBehavior {
  return TOKEN_BEHAVIORS[token] ?? UNKNOWN_TOKEN_BEHAVIOR;
}
