import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

function breakerAt(clock: { t: number }) {
  return new CircuitBreaker({ failureThreshold: 3, openDurationMs: 1000, now: () => clock.t });
}
const fail = () => Promise.reject(new Error('down'));
const ok = () => Promise.resolve('ok');

async function tripOpen(breaker: CircuitBreaker): Promise<void> {
  for (let i = 0; i < 3; i += 1) await breaker.execute(fail).catch(() => undefined);
}

test('opens after N consecutive failures and fails fast without calling the provider', async () => {
  const clock = { t: 0 };
  const breaker = breakerAt(clock);
  await tripOpen(breaker);
  expect(breaker.state).toBe('OPEN');
  const op = jest.fn(ok);
  await expect(breaker.execute(op)).rejects.toBeInstanceOf(CircuitOpenError);
  expect(op).not.toHaveBeenCalled();
});

test('half-open probe success closes the circuit', async () => {
  const clock = { t: 0 };
  const breaker = breakerAt(clock);
  await tripOpen(breaker);
  clock.t = 1000;
  expect(breaker.state).toBe('HALF_OPEN');
  await expect(breaker.execute(ok)).resolves.toBe('ok');
  expect(breaker.state).toBe('CLOSED');
});

test('half-open probe failure re-opens the circuit', async () => {
  const clock = { t: 0 };
  const breaker = breakerAt(clock);
  await tripOpen(breaker);
  clock.t = 1500;
  await expect(breaker.execute(fail)).rejects.toThrow('down');
  expect(breaker.state).toBe('OPEN');
});

test('a success resets the consecutive failure count', async () => {
  const breaker = breakerAt({ t: 0 });
  await breaker.execute(fail).catch(() => undefined);
  await breaker.execute(fail).catch(() => undefined);
  await breaker.execute(ok);
  await breaker.execute(fail).catch(() => undefined);
  expect(breaker.state).toBe('CLOSED');
});
