import { TwoTierCache } from '../src/shared/cache/two-tier-cache';
import { SNAPSHOT_KEY } from '../src/modules/catalog/application/catalog-snapshot.service';
import { createJameya, createMember, getReservation, Member, reserve } from './support/fixtures';
import { Harness, startHarness } from './support/harness';

let h: Harness;
beforeAll(async () => (h = await startHarness()));
afterAll(() => h.close());

const get = (path: string, m: Member, etag?: string) => {
  const req = h.http.get(path).set('Authorization', `Bearer ${m.token}`);
  return etag ? req.set('If-None-Match', etag) : req;
};
const refreshSnapshot = () => h.app.get(TwoTierCache).invalidate(SNAPSHOT_KEY);

test('list ETag is stable across a snapshot refresh with no data change → 304 with X-As-Of, no body', async () => {
  const m = await createMember(h);
  await refreshSnapshot(); // both reads must see the same data (earlier tests changed it)
  const first = await get('/api/v1/jameyas?pageSize=5', m).expect(200);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await refreshSnapshot();
  const second = await get('/api/v1/jameyas?pageSize=5', m, first.headers.etag);
  expect([second.status, second.text, second.headers.etag]).toEqual([304, '', first.headers.etag]);
  expect(Date.parse(second.headers['x-as-of'])).toBeGreaterThan(Date.parse(first.headers['x-as-of']));
});

test('detail ETag changes when a seat is reserved (by someone else)', async () => {
  const [jameyaId, viewer, other] = await Promise.all([createJameya(h), createMember(h), createMember(h)]);
  const before = await get(`/api/v1/jameyas/${jameyaId}`, viewer).expect(200);
  expect((await get(`/api/v1/jameyas/${jameyaId}`, viewer, before.headers.etag)).status).toBe(304);
  await reserve(h, other, jameyaId, 4).expect(201);
  const after = await get(`/api/v1/jameyas/${jameyaId}`, viewer, before.headers.etag);
  expect(after.status).toBe(200);
  expect(after.headers.etag).not.toBe(before.headers.etag);
  expect(after.body.seats[3].status).toBe('HELD');
});

test('reservation ETag changes when its status changes', async () => {
  const [jameyaId, m] = await Promise.all([createJameya(h), createMember(h)]);
  const id = (await reserve(h, m, jameyaId, 3)).body.id;
  const held = await getReservation(h, m, id).expect(200);
  expect((await get(`/api/v1/reservations/${id}`, m, held.headers.etag)).status).toBe(304);
  await h.http.delete(`/api/v1/reservations/${id}`).set('Authorization', `Bearer ${m.token}`).expect(200);
  const cancelled = await get(`/api/v1/reservations/${id}`, m, held.headers.etag);
  expect([cancelled.status, cancelled.body.status]).toEqual([200, 'CANCELLED']);
});

test('/me ETag ignores kycCheckedAt but changes when the hold count changes', async () => {
  const [jameyaId, m] = await Promise.all([createJameya(h), createMember(h)]);
  const first = await get('/api/v1/me', m).expect(200);
  expect((await get('/api/v1/me', m, first.headers.etag)).status).toBe(304);
  await reserve(h, m, jameyaId, 5).expect(201);
  const after = await get('/api/v1/me', m, first.headers.etag);
  expect([after.status, after.body.limits.activeHolds]).toEqual([200, 1]);
});
