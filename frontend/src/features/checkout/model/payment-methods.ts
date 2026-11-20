/** The five simulated-provider tokens from docs/api/README.md. No real card is ever involved. */
export interface PaymentTestToken {
  token: 'tok_success' | 'tok_decline' | 'tok_slow' | 'tok_duplicate' | 'tok_timeout';
  label: string;
  detail: string;
}

export const PAYMENT_TEST_TOKENS: readonly PaymentTestToken[] = [
  { token: 'tok_success', label: 'Success', detail: 'Authorizes in about a second and confirms the seat.' },
  { token: 'tok_decline', label: 'Decline', detail: 'The issuer declines for insufficient funds. Nothing is charged.' },
  { token: 'tok_slow', label: 'Slow authorization', detail: 'Takes about eight seconds. This page keeps checking.' },
  { token: 'tok_duplicate', label: 'Duplicate callbacks', detail: 'The provider repeats its confirmation. The seat is still confirmed once.' },
  { token: 'tok_timeout', label: 'Provider timeout', detail: 'No confirmation arrives. Resolution can take several minutes, and any authorization is voided.' },
];

export const DEFAULT_PAYMENT_TOKEN: PaymentTestToken['token'] = 'tok_success';
