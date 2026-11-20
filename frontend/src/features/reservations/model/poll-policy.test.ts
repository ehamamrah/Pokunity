import { describe, expect, it } from 'vitest';
import { TIMING } from '@/shared/config/timing';
import { pollIntervalFor } from './poll-policy';

describe('checkout polling policy', () => {
  it.each(['CONFIRMED', 'EXPIRED', 'CANCELLED', 'FAILED'] as const)('stops polling on terminal status %s', (status) => {
    expect(pollIntervalFor(status, 0)).toBe(false);
  });

  it('polls quickly while payment is pending, then backs off after 15 seconds', () => {
    expect(pollIntervalFor('PAYMENT_PENDING', 2_000)).toBe(TIMING.checkoutFastPollMs);
    expect(pollIntervalFor('PAYMENT_PENDING', 16_000)).toBe(TIMING.checkoutSlowPollMs);
  });

  it('watches a HELD hold at a slow cadence to notice server-side expiry', () => {
    expect(pollIntervalFor('HELD', 0)).toBe(TIMING.holdRefetchMs);
  });
});
