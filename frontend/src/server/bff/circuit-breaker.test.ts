import { expect, it } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';

function clockBreaker(threshold = 3, openMs = 10_000) {
  const clock = { t: 0 };
  const breaker = new CircuitBreaker({ failureThreshold: threshold, openMs, now: () => clock.t });
  return { breaker, clock };
}

function failAll(breaker: CircuitBreaker, times: number): void {
  for (let index = 0; index < times; index += 1) {
    breaker.acquire();
    breaker.record(false);
  }
}

it('stays closed while failures are below the threshold', () => {
  const { breaker } = clockBreaker(3);
  failAll(breaker, 2);
  expect(breaker.state()).toBe('closed');
  expect(breaker.acquire()).toBe(true);
});

it('opens after consecutive failures reach the threshold', () => {
  const { breaker } = clockBreaker(3);
  failAll(breaker, 3);
  expect(breaker.state()).toBe('open');
});

it('resets the failure count on success, so intermittent errors do not trip it', () => {
  const { breaker } = clockBreaker(3);
  failAll(breaker, 2);
  breaker.acquire();
  breaker.record(true);
  failAll(breaker, 2);
  expect(breaker.state()).toBe('closed');
});

it('fails fast without calling the backend while open', () => {
  const { breaker } = clockBreaker(1);
  failAll(breaker, 1);
  expect(breaker.acquire()).toBe(false);
  expect(breaker.acquire()).toBe(false);
});

it('reports a Retry-After in whole seconds until the probe window', () => {
  const { breaker, clock } = clockBreaker(1, 10_000);
  failAll(breaker, 1);
  clock.t = 4_000;
  expect(breaker.retryAfterSeconds()).toBe(6);
});

it('admits exactly one half-open probe after the open window', () => {
  const { breaker, clock } = clockBreaker(1, 10_000);
  failAll(breaker, 1);
  clock.t = 10_000;
  expect(breaker.acquire()).toBe(true);
  expect(breaker.state()).toBe('half-open');
  expect(breaker.acquire()).toBe(false);
});

it('closes again when the half-open probe succeeds', () => {
  const { breaker, clock } = clockBreaker(1, 10_000);
  failAll(breaker, 1);
  clock.t = 10_000;
  breaker.acquire();
  breaker.record(true);
  expect(breaker.state()).toBe('closed');
  expect(breaker.acquire()).toBe(true);
});

it('reopens when the half-open probe fails', () => {
  const { breaker, clock } = clockBreaker(1, 10_000);
  failAll(breaker, 1);
  clock.t = 10_000;
  breaker.acquire();
  breaker.record(false);
  expect(breaker.state()).toBe('open');
  expect(breaker.acquire()).toBe(false);
});

it('ignores a late success from a request admitted before the circuit opened', () => {
  const { breaker } = clockBreaker(1);
  failAll(breaker, 1);
  breaker.record(true);
  expect(breaker.state()).toBe('open');
});
