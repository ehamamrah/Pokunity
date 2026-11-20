import { CircuitBreaker, CircuitOpenError } from '../../../shared/resilience/circuit-breaker';
import { PaymentGateway } from '../payment-gateway.port';
import { ResilientPaymentGateway } from './resilient-payment-gateway';

function gatewayWith(capture: jest.Mock): ResilientPaymentGateway {
  const inner = { capture } as unknown as PaymentGateway;
  return new ResilientPaymentGateway(inner, new CircuitBreaker({ failureThreshold: 2, openDurationMs: 60_000 }), 50);
}

test('provider calls time out instead of hanging', async () => {
  const gateway = gatewayWith(jest.fn(() => new Promise(() => undefined)));
  await expect(gateway.capture('pi_1', 'capture:p1')).rejects.toThrow(/timed out/);
});

test('after repeated failures the breaker opens and calls fail fast (outbox retries later)', async () => {
  const capture = jest.fn(() => Promise.reject(new Error('provider 503')));
  const gateway = gatewayWith(capture);
  await expect(gateway.capture('pi_1', 'k')).rejects.toThrow('provider 503');
  await expect(gateway.capture('pi_1', 'k')).rejects.toThrow('provider 503');
  await expect(gateway.capture('pi_1', 'k')).rejects.toBeInstanceOf(CircuitOpenError);
  expect(capture).toHaveBeenCalledTimes(2);
});
