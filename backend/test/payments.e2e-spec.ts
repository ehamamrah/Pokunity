import { OutboxProcessorJob } from '../src/modules/payments/application/outbox-processor.job';
import { ReconciliationJob } from '../src/modules/payments/application/reconciliation.job';
import { checkout, createJameya, createMember, getReservation, Member, reserve, sendWebhook } from './support/fixtures';
import { Harness, startHarness } from './support/harness';
import { agePayment, ledgerOf, PaymentRow, paymentOf, providerAuthorizes, providerEvent, seatStatus } from './support/payments';

let h: Harness;
beforeAll(async () => (h = await startHarness()));
afterAll(() => h.close());

const drainOutbox = () => h.app.get(OutboxProcessorJob).drain();
const reconcile = () => h.app.get(ReconciliationJob).run();

/** Member holds seat 2 (fee 8 000) and starts checkout with the given test token. */
async function pendingPayment(token: string): Promise<{ m: Member; jameyaId: string; reservationId: string; payment: PaymentRow }> {
  const [jameyaId, m] = await Promise.all([createJameya(h), createMember(h)]);
  const reservationId = (await reserve(h, m, jameyaId, 2)).body.id;
  expect((await checkout(h, m, reservationId, token)).status).toBe(202);
  await drainOutbox(); // AUTHORIZE is an outbox command (committed with the checkout)
  return { m, jameyaId, reservationId, payment: await paymentOf(h, reservationId) };
}

/** Confirmed seat, exactly one capture in the ledger and exactly one settlement command. */
async function expectCapturedOnce(m: Member, jameyaId: string, reservationId: string, payment: PaymentRow): Promise<void> {
  const view = (await getReservation(h, m, reservationId)).body;
  expect([view.status, view.payment.status]).toEqual(['CONFIRMED', 'CAPTURED']);
  expect(await ledgerOf(h, payment.id)).toEqual(['AUTHORIZE', 'CAPTURE']);
  expect(await seatStatus(h, jameyaId, 2)).toBe('TAKEN');
  const settlements = await h.db.query(`SELECT command FROM payment_outbox WHERE payment_id = $1 AND command <> 'AUTHORIZE'`, [payment.id]);
  expect(settlements.rows).toEqual([{ command: 'CAPTURE' }]);
}

test('duplicate payment.authorized (3x concurrently) confirms once and captures once', async () => {
  const { m, jameyaId, reservationId, payment } = await pendingPayment('tok_duplicate');
  await providerAuthorizes(h, payment);
  const event = providerEvent('payment.authorized', payment);
  const responses = await Promise.all([1, 2, 3].map(() => sendWebhook(h, event)));
  expect(responses.map((r) => r.body.duplicate).sort()).toEqual([false, true, true]);
  await drainOutbox();
  expect((await sendWebhook(h, event)).body).toEqual({ received: true, duplicate: true });
  await drainOutbox();
  await expectCapturedOnce(m, jameyaId, reservationId, payment);
});

test('payment.failed marks the reservation FAILED and releases the seat; nothing is charged', async () => {
  const { m, jameyaId, reservationId, payment } = await pendingPayment('tok_decline');
  await sendWebhook(h, providerEvent('payment.failed', payment)).expect(200);
  const view = (await getReservation(h, m, reservationId)).body;
  expect([view.status, view.failureReason, view.payment.status]).toEqual(['FAILED', 'PAYMENT_DECLINED', 'FAILED']);
  expect(await seatStatus(h, jameyaId, 2)).toBe('AVAILABLE');
  expect(await ledgerOf(h, payment.id)).toEqual([]);
});

test('authorization arriving after the payment timed out is voided, never captured', async () => {
  const { m, jameyaId, reservationId, payment } = await pendingPayment('tok_slow');
  await agePayment(h, payment.id, 11 * 60);
  await reconcile();
  await drainOutbox();
  expect((await getReservation(h, m, reservationId)).body.failureReason).toBe('PAYMENT_TIMEOUT');
  expect(await seatStatus(h, jameyaId, 2)).toBe('AVAILABLE');
  await sendWebhook(h, providerEvent('payment.authorized', payment)).expect(200);
  await drainOutbox();
  const view = (await getReservation(h, m, reservationId)).body;
  expect([view.status, view.payment.status]).toEqual(['FAILED', 'VOIDED']);
  expect(await ledgerOf(h, payment.id)).toEqual(['AUTHORIZE', 'VOID']);
});

test('lost webhook (tok_timeout): reconciliation finds the authorization, confirms and captures', async () => {
  const { m, reservationId, payment } = await pendingPayment('tok_timeout');
  await reconcile();
  expect((await getReservation(h, m, reservationId)).body.status).toBe('PAYMENT_PENDING');
  await agePayment(h, payment.id, 3 * 60);
  await reconcile();
  await drainOutbox();
  const view = (await getReservation(h, m, reservationId)).body;
  expect([view.status, view.payment.status]).toEqual(['CONFIRMED', 'CAPTURED']);
});

test('out-of-order payment.captured before authorization is recorded and ignored', async () => {
  const { reservationId, payment } = await pendingPayment('tok_success');
  const event = providerEvent('payment.captured', payment);
  await sendWebhook(h, event).expect(200);
  expect((await paymentOf(h, reservationId)).status).toBe('AUTHORIZING');
  expect(await ledgerOf(h, payment.id)).toEqual([]);
  const { rows } = await h.db.query<{ outcome: string }>('SELECT outcome FROM payment_events WHERE event_id = $1', [event.eventId]);
  expect(rows[0].outcome).toBe('IGNORED');
});

test('unknown intent is stored as an orphan (200) and bad signatures are rejected (401)', async () => {
  const event = { ...providerEvent('payment.authorized', { id: 'x', status: 'x', provider_intent_id: 'pi_unknown', amount: 100 }) };
  expect((await sendWebhook(h, event)).body).toEqual({ received: true, duplicate: false });
  const { rows } = await h.db.query<{ outcome: string }>('SELECT outcome FROM payment_events WHERE event_id = $1', [event.eventId]);
  expect(rows[0].outcome).toBe('ORPHAN');
  const forged = await sendWebhook(h, event, 'wrong-secret');
  expect([forged.status, forged.body.error.code]).toEqual([401, 'INVALID_SIGNATURE']);
});
