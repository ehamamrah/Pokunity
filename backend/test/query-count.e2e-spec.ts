import { BufferedEventWriter } from '../src/modules/analytics/infrastructure/buffered-event-writer';
import { HoldExpiryJob } from '../src/modules/reservations/application/hold-expiry.job';
import { SNAPSHOT_KEY } from '../src/modules/catalog/application/catalog-snapshot.service';
import { TwoTierCache } from '../src/shared/cache/two-tier-cache';
import { checkout, createJameya, createMember, createMembers, Member, reserve } from './support/fixtures';
import { Harness, startHarness } from './support/harness';
import { countQueries } from './support/query-counter';

let h: Harness;
let viewer: Member;
beforeAll(async () => {
  h = await startHarness();
  viewer = await createMember(h);
});
afterAll(() => h.close());

const get = (path: string, m: Member = viewer) => h.http.get(path).set('Authorization', `Bearer ${m.token}`);

/** Warm caches (snapshot, KYC) with one call, then count the queries of an identical call. */
async function queriesOf(path: string, m: Member = viewer): Promise<number> {
  await get(path, m).expect(200);
  return (await countQueries(() => get(path, m).expect(200))).count;
}

test('GET /jameyas issues the same (constant) number of queries for 5 or 50 items', async () => {
  await createJameya(h);
  const small = await queriesOf('/api/v1/jameyas?pageSize=5&sort=recommended');
  const large = await queriesOf('/api/v1/jameyas?pageSize=50&sort=recommended');
  expect(large).toBe(small);
  expect(small).toBeLessThanOrEqual(1); // viewer preferences; the snapshot is served from cache
});

test('GET /jameyas/:id is constant in queries regardless of the number of seats', async () => {
  const [small, large] = await Promise.all([createJameya(h, 6), createJameya(h, 24)]);
  const a = await queriesOf(`/api/v1/jameyas/${small}`);
  const b = await queriesOf(`/api/v1/jameyas/${large}`);
  expect(b).toBe(a);
  expect(a).toBeLessThanOrEqual(3); // viewer + active-hold count + one-query seat map (cached ≤ 2 s)
});

test('GET /jameyas/{id}/similar is served from the snapshot (no per-request catalog query)', async () => {
  const id = await createJameya(h);
  await h.app.get(TwoTierCache).invalidate(SNAPSHOT_KEY); // make sure the new Jameya is in the snapshot
  expect(await queriesOf(`/api/v1/jameyas/${id}/similar`)).toBeLessThanOrEqual(1); // viewer preferences only
});

async function memberWithReservations(count: number): Promise<Member> {
  const m = await createMember(h);
  for (let i = 0; i < count; i += 1) {
    const id = (await reserve(h, m, await createJameya(h, 6), 6)).body.id;
    await checkout(h, m, id, 'tok_success').expect(200); // zero-fee seat → CONFIRMED, frees the hold slot
  }
  return m;
}

test('GET /reservations is constant in queries (1 vs 4 reservations; page + total in one query)', async () => {
  const [one, four] = [await memberWithReservations(1), await memberWithReservations(4)];
  const a = await queriesOf('/api/v1/reservations', one);
  const b = await queriesOf('/api/v1/reservations', four);
  expect([a, b]).toEqual([2, 2]);
});

test('GET /me needs exactly 2 queries (viewer + active holds)', async () => {
  expect(await queriesOf('/api/v1/me')).toBe(2);
});

async function sweepQueries(holds: number): Promise<number> {
  const [jameyaId, members] = await Promise.all([createJameya(h, holds), createMembers(h, holds)]);
  const ids = await Promise.all(members.map(async (m, i) => (await reserve(h, m, jameyaId, i + 1)).body.id as string));
  await h.db.query(`UPDATE reservations SET expires_at = now() - interval '1 minute' WHERE id = ANY($1)`, [ids]);
  const { result, count } = await countQueries(() => h.app.get(HoldExpiryJob).sweep());
  expect(result).toBe(holds);
  return count;
}

test('the expiry sweeper is set-based: 2 or 20 expired holds cost the same queries', async () => {
  expect(await sweepQueries(20)).toBe(await sweepQueries(2));
});

test('POST /events does no database work on the request path (buffered batch insert)', async () => {
  const jameyaId = await createJameya(h);
  const event = { type: 'impression', jameyaId, position: 1, surface: 'marketplace_list', occurredAt: new Date().toISOString() };
  const send = () => h.http.post('/api/v1/events').set('Authorization', `Bearer ${viewer.token}`).send({ events: Array(50).fill(event) });
  const { result, count } = await countQueries(() => send());
  expect([result.status, result.body.accepted, count]).toEqual([202, 50, 0]);
  const flush = await countQueries(() => h.app.get(BufferedEventWriter).flush());
  expect(flush.count).toBe(1);
});
