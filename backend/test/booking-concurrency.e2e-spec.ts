import { randomUUID } from 'node:crypto';
import { CatalogFacade } from '../src/modules/catalog/catalog.facade';
import { createJameya, createMember, createMembers, reserve } from './support/fixtures';
import { Harness, startHarness } from './support/harness';

let h: Harness;
beforeAll(async () => (h = await startHarness()));
afterAll(() => h.close());

const liveReservations = async (jameyaId: string, seat: number) =>
  (await h.db.query(`SELECT 1 FROM reservations WHERE jameya_id = $1 AND seat_number = $2
     AND status IN ('HELD','PAYMENT_PENDING','CONFIRMED')`, [jameyaId, seat])).rowCount;

test('50 members racing for the same seat: exactly one hold, everyone else SEAT_UNAVAILABLE', async () => {
  const [jameyaId, members] = await Promise.all([createJameya(h), createMembers(h, 50)]);
  const responses = await Promise.all(members.map((m) => reserve(h, m, jameyaId, 3)));
  const statuses = responses.map((r) => r.status);
  expect(statuses.filter((s) => s === 201)).toHaveLength(1);
  expect(responses.filter((r) => r.status === 409).every((r) => r.body.error.code === 'SEAT_UNAVAILABLE')).toBe(true);
  expect(await liveReservations(jameyaId, 3)).toBe(1);
});

test('the PostgreSQL conditional claim alone admits exactly one of 30 concurrent transactions', async () => {
  const jameyaId = await createJameya(h);
  const catalog = h.app.get(CatalogFacade);
  const claim = () => h.db.transaction((tx) =>
    catalog.claimSeat(tx, { jameyaId, seatNumber: 1, reservationId: randomUUID(), userId: randomUUID() }));
  const results = await Promise.all(Array.from({ length: 30 }, claim));
  expect(results.filter((r) => r !== null)).toHaveLength(1);
});

test('partial unique index rejects a second live reservation for the same seat', async () => {
  const jameyaId = await createJameya(h);
  const insert = () => h.db.query(`INSERT INTO reservations (id, user_id, jameya_id, jameya_name, seat_number, fee, monthly_amount, status, expires_at)
    VALUES ($1, $2, $3, 'x', 1, 0, 1, 'HELD', now() + interval '5 minutes')`, [randomUUID(), randomUUID(), jameyaId]);
  await insert();
  await expect(insert()).rejects.toMatchObject({ code: '23505', constraint: 'reservations_live_seat_uq' });
});

test('double click with the same Idempotency-Key creates one hold and replays it', async () => {
  const [jameyaId, member] = await Promise.all([createJameya(h), createMember(h)]);
  const key = randomUUID();
  const [a, b] = await Promise.all([reserve(h, member, jameyaId, 2, key), reserve(h, member, jameyaId, 2, key)]);
  expect([a.status, b.status].sort()).toEqual(expect.arrayContaining([201]));
  expect([201, 409]).toContain(b.status === 201 ? a.status : b.status);
  const replay = await reserve(h, member, jameyaId, 2, key);
  expect(replay.status).toBe(201);
  expect(replay.headers['idempotent-replayed']).toBe('true');
  expect((await h.db.query('SELECT 1 FROM reservations WHERE user_id = $1', [member.id])).rowCount).toBe(1);
});

test('hold limit holds under concurrent requests from one member (5 Jameyas, max 3)', async () => {
  const member = await createMember(h);
  const jameyas = await Promise.all(Array.from({ length: 5 }, () => createJameya(h)));
  const responses = await Promise.all(jameyas.map((j) => reserve(h, member, j, 5)));
  expect(responses.filter((r) => r.status === 201)).toHaveLength(3);
  expect(responses.filter((r) => r.body.error?.code === 'HOLD_LIMIT_REACHED')).toHaveLength(2);
});

test('same key with a different body is rejected with IDEMPOTENCY_KEY_REUSED', async () => {
  const [jameyaId, member] = await Promise.all([createJameya(h), createMember(h)]);
  const key = randomUUID();
  expect((await reserve(h, member, jameyaId, 4, key)).status).toBe(201);
  const reused = await reserve(h, member, jameyaId, 6, key);
  expect(reused.status).toBe(422);
  expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
});

test('eligibility errors: KYC_REQUIRED and RISK_RESTRICTED', async () => {
  const jameyaId = await createJameya(h);
  const pending = await createMember(h, { kyc: 'PENDING' });
  const risky = await createMember(h, { risk: 'HIGH' });
  expect((await reserve(h, pending, jameyaId, 9)).body.error.code).toBe('KYC_REQUIRED');
  expect((await reserve(h, risky, jameyaId, 1)).body.error.code).toBe('RISK_RESTRICTED');
  expect((await reserve(h, risky, jameyaId, 9)).status).toBe(201);
});
