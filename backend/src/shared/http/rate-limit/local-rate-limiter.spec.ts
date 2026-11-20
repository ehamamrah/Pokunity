import { LocalRateLimiter } from './local-rate-limiter';

test('fallback limiter allows `limit` hits per window and reports remaining/reset', () => {
  const limiter = new LocalRateLimiter();
  const decisions = Array.from({ length: 6 }, () => limiter.hit('k', 5, 10_000, 1_000));
  expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, true, true, false]);
  expect(decisions[0]).toMatchObject({ limit: 5, remaining: 4, resetSeconds: 10 });
  expect(decisions[5].remaining).toBe(0);
});

test('a new window starts after the reset time', () => {
  const limiter = new LocalRateLimiter();
  for (let i = 0; i < 5; i += 1) limiter.hit('k', 5, 10_000, 0);
  expect(limiter.hit('k', 5, 10_000, 10_001).allowed).toBe(true);
});
