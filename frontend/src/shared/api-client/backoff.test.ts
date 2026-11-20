import { expect, it } from 'vitest';
import { ApiError } from './errors';
import { backoffDelayMs } from './backoff';

const lowest = () => 0;
const highest = () => 1;

it('uses the lower half of the ceiling when jitter is zero', () => {
  expect(backoffDelayMs(1, new Error('x'), lowest)).toBe(250);
  expect(backoffDelayMs(3, new Error('x'), lowest)).toBe(1000);
});

it('never exceeds the 4 s ceiling, however many attempts', () => {
  expect(backoffDelayMs(10, new Error('x'), highest)).toBe(4000);
});

it('spreads retries across the window so clients do not retry in lockstep', () => {
  expect(backoffDelayMs(2, new Error('x'), highest)).toBeGreaterThan(backoffDelayMs(2, new Error('x'), lowest));
});

it('honors a server Retry-After exactly, ignoring jitter', () => {
  const limited = new ApiError({ status: 429, code: 'RATE_LIMITED', message: '', retryAfterSeconds: 3 });
  expect(backoffDelayMs(1, limited, highest)).toBe(3000);
});

it('caps a hostile Retry-After at 30 seconds', () => {
  const limited = new ApiError({ status: 429, code: 'RATE_LIMITED', message: '', retryAfterSeconds: 3600 });
  expect(backoffDelayMs(1, limited)).toBe(30_000);
});
