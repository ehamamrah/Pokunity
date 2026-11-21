import { randomUUID } from 'node:crypto';
import { checkout, createJameya, createMember, Member, reserve, sendWebhook } from './support/fixtures';
import { Harness, startHarness } from './support/harness';
import { paymentOf, providerEvent } from './support/payments';

let h: Harness;
beforeAll(async () => (h = await startHarness()));
afterAll(() => h.close());

const get = (path: string, m: Member) => h.http.get(path).set('Authorization', `Bearer ${m.token}`);

test('GET /jameyas/{id}/similar returns ≤ 5 open look-alikes, never the Jameya itself', async () => {
  const [target, m] = await Promise.all([createJameya(h, 10), createMember(h)]);
  await Promise.all([createJameya(h, 10), createJameya(h, 12), createJameya(h, 20)]);
  const res = await get(`/api/v1/jameyas/${target}/similar`, m).expect(200);
  expect(res.body.data.length).toBeLessThanOrEqual(5);
  expect(res.body.data.some((j: { id: string }) => j.id === target)).toBe(false);
  expect(res.body.data.every((j: { durationMonths: number }) => Math.abs(j.durationMonths - 10) <= 2)).toBe(true);
  expect(res.body.meta.experiment.key).toBe('ranking_v2');
  await get(`/api/v1/jameyas/${randomUUID()}/similar`, m).expect(404);
});

test('GET /reservations is paginated with meta.total (newest first)', async () => {
  const m = await createMember(h);
  for (let i = 0; i < 3; i += 1) await reserve(h, m, await createJameya(h), 9).expect(201);
  const first = await get('/api/v1/reservations?pageSize=2', m).expect(200);
  expect([first.body.data.length, first.body.meta]).toEqual([2, { page: 1, pageSize: 2, total: 3 }]);
  const second = await get('/api/v1/reservations?pageSize=2&page=2', m).expect(200);
  expect(second.body.data.length).toBe(1);
  expect((await get('/api/v1/reservations?page=9', m)).body).toEqual({ data: [], meta: { page: 9, pageSize: 20, total: 3 } });
});

test('payment.resolveBy is the reconciliation deadline while authorizing, null once decided', async () => {
  const [jameyaId, m] = await Promise.all([createJameya(h), createMember(h)]);
  const id = (await reserve(h, m, jameyaId, 2)).body.id;
  const pending = (await checkout(h, m, id, 'tok_decline').expect(202)).body.payment;
  expect(Date.parse(pending.resolveBy) - Date.now()).toBeGreaterThan(9 * 60 * 1000);
  await h.db.query(`UPDATE payments SET provider_intent_id = $2 WHERE id = $1`, [pending.id, `pi_${randomUUID()}`]);
  await sendWebhook(h, providerEvent('payment.failed', await paymentOf(h, id))).expect(200);
  const failed = (await get(`/api/v1/reservations/${id}`, m)).body.payment;
  expect([failed.status, failed.resolveBy]).toEqual(['FAILED', null]);
});

test('detail: HOLD_LIMIT blocks a member at the hold limit; experiment is returned', async () => {
  const m = await createMember(h);
  for (let i = 0; i < 3; i += 1) await reserve(h, m, await createJameya(h), 9).expect(201);
  const detail = (await get(`/api/v1/jameyas/${await createJameya(h)}`, m).expect(200)).body;
  expect(detail.viewer).toEqual({ canReserve: false, blockingReason: 'HOLD_LIMIT', activeReservationId: null });
  expect(detail.experiment).toMatchObject({ key: 'ranking_v2' });
});

test('every error has a non-empty traceId equal to X-Request-Id, even for malformed JSON', async () => {
  const m = await createMember(h);
  const res = await h.http.post('/api/v1/events').set('Authorization', `Bearer ${m.token}`)
    .set('Content-Type', 'application/json').send('{"events": [');
  expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
  expect(res.body.error.traceId).toBeTruthy();
  expect(res.body.error.traceId).toBe(res.headers['x-request-id']);
});

test('analytics accepts surface "checkout" (v1.1)', async () => {
  const [jameyaId, m] = await Promise.all([createJameya(h), createMember(h)]);
  const event = { type: 'checkout_started', jameyaId, surface: 'checkout', occurredAt: new Date().toISOString() };
  const res = await h.http.post('/api/v1/events').set('Authorization', `Bearer ${m.token}`).send({ events: [event] });
  expect([res.status, res.body.accepted]).toEqual([202, 1]);
});
