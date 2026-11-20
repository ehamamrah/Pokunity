/** Simulated provider latency per test token (docs/api/README.md). `tok_timeout` never resolves. */
export const CHECKOUT_DELAYS_MS: Record<string, number> = {
  tok_success: 1_000,
  tok_decline: 800,
  tok_slow: 8_000,
  tok_duplicate: 1_000,
  tok_timeout: Number.POSITIVE_INFINITY,
};

export const PAYMENT_TOKENS = ['tok_success', 'tok_decline', 'tok_slow', 'tok_duplicate', 'tok_timeout'] as const;
