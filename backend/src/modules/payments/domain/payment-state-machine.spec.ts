import { canTransitionPayment, paymentSourcesOf } from './payment-state-machine';
import { decideReconciliation } from './reconciliation-policy';
import { isValidSignature, signPayload } from './webhook-signature';

test('capture is only possible from AUTHORIZED; nothing leaves CAPTURED', () => {
  expect(paymentSourcesOf('CAPTURED')).toEqual(['AUTHORIZED']);
  expect(canTransitionPayment('CAPTURED', 'VOIDED')).toBe(false);
  expect(canTransitionPayment('AUTHORIZING', 'CAPTURED')).toBe(false);
});

test('a late authorization on a FAILED payment can only be voided', () => {
  expect(canTransitionPayment('FAILED', 'VOIDED')).toBe(true);
  expect(canTransitionPayment('FAILED', 'CAPTURED')).toBe(false);
  expect(canTransitionPayment('FAILED', 'AUTHORIZED')).toBe(false);
});

test('reconciliation verdicts follow the provider view of the intent', () => {
  expect(decideReconciliation({ intentId: 'pi', status: 'AUTHORIZED' }, false)).toBe('authorized');
  expect(decideReconciliation({ intentId: 'pi', status: 'CAPTURED' }, true)).toBe('authorized');
  expect(decideReconciliation({ intentId: 'pi', status: 'FAILED' }, false)).toBe('failed');
  expect(decideReconciliation({ intentId: 'pi', status: 'PENDING' }, false)).toBe('wait');
  expect(decideReconciliation({ intentId: 'pi', status: 'PENDING' }, true)).toBe('timeout');
  expect(decideReconciliation(null, false)).toBe('timeout');
});

test('webhook signature is HMAC-SHA256 hex of the raw body', () => {
  const body = Buffer.from('{"eventId":"evt_1"}');
  const sig = signPayload(body, 'secret');
  expect(isValidSignature(body, sig, 'secret')).toBe(true);
  expect(isValidSignature(body, sig, 'other')).toBe(false);
  expect(isValidSignature(Buffer.from('{"eventId":"evt_2"}'), sig, 'secret')).toBe(false);
  expect(isValidSignature(body, undefined, 'secret')).toBe(false);
  expect(isValidSignature(body, 'zz', 'secret')).toBe(false);
});
