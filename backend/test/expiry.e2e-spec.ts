import { HoldExpiryJob } from '../src/modules/reservations/application/hold-expiry.job';
import { checkout, createJameya, createMember, getReservation, reserve } from './support/fixtures';
import { Harness, startHarness } from './support/harness';
import { seatStatus } from './support/payments';

let h: Harness;
beforeAll(async () => (h = await startHarness()));
afterAll(() => h.close());

const backdateHold = (reservationId: string) =>
  h.db.query(`UPDATE reservations SET expires_at = now() - interval '1 minute' WHERE id = $1`, [reservationId]);

test('sweeper expires overdue HELD holds but never a PAYMENT_PENDING reservation', async () => {
  const [jameyaId, idle, payer] = await Promise.all([createJameya(h), createMember(h), createMember(h)]);
  const idleId = (await reserve(h, idle, jameyaId, 1)).body.id;
  const payerId = (await reserve(h, payer, jameyaId, 2)).body.id;
  await checkout(h, payer, payerId, 'tok_slow').expect(202);
  await Promise.all([backdateHold(idleId), backdateHold(payerId)]);
  await h.app.get(HoldExpiryJob).sweep();
  const expired = (await getReservation(h, idle, idleId)).body;
  expect([expired.status, expired.failureReason]).toEqual(['EXPIRED', 'HOLD_EXPIRED']);
  expect((await getReservation(h, payer, payerId)).body.status).toBe('PAYMENT_PENDING');
  expect([await seatStatus(h, jameyaId, 1), await seatStatus(h, jameyaId, 2)]).toEqual(['AVAILABLE', 'HELD']);
  const { rows } = await h.db.query('SELECT expired_holds_count FROM user_behavior WHERE user_id = $1', [idle.id]);
  expect(rows[0].expired_holds_count).toBe(1);
});

test('checkout after the hold expired returns 410 even before the sweeper ran', async () => {
  const [jameyaId, m] = await Promise.all([createJameya(h), createMember(h)]);
  const id = (await reserve(h, m, jameyaId, 3)).body.id;
  await backdateHold(id);
  const res = await checkout(h, m, id, 'tok_success');
  expect([res.status, res.body.error.code]).toEqual([410, 'RESERVATION_EXPIRED']);
});

test('zero-fee seat confirms at checkout without a payment (200)', async () => {
  const [jameyaId, m] = await Promise.all([createJameya(h, 6), createMember(h)]);
  const id = (await reserve(h, m, jameyaId, 6)).body.id;
  const res = await checkout(h, m, id, 'tok_success');
  expect([res.status, res.body.status, res.body.payment]).toEqual([200, 'CONFIRMED', null]);
  expect(await seatStatus(h, jameyaId, 6)).toBe('TAKEN');
});

test('cancel releases the seat, is idempotent, and PAYMENT_PENDING cannot be cancelled', async () => {
  const [jameyaId, m] = await Promise.all([createJameya(h), createMember(h)]);
  const id = (await reserve(h, m, jameyaId, 4)).body.id;
  const del = () => h.http.delete(`/api/v1/reservations/${id}`).set('Authorization', `Bearer ${m.token}`);
  expect((await del()).body.status).toBe('CANCELLED');
  expect((await del()).status).toBe(200);
  expect(await seatStatus(h, jameyaId, 4)).toBe('AVAILABLE');
  const other = (await reserve(h, m, jameyaId, 5)).body.id;
  await checkout(h, m, other, 'tok_slow').expect(202);
  const blocked = await h.http.delete(`/api/v1/reservations/${other}`).set('Authorization', `Bearer ${m.token}`);
  expect([blocked.status, blocked.body.error.details.status]).toEqual([409, 'PAYMENT_PENDING']);
});

test('database rejects illegal status transitions and ledger mutation (defence in depth)', async () => {
  const [jameyaId, m] = await Promise.all([createJameya(h), createMember(h)]);
  const id = (await reserve(h, m, jameyaId, 7)).body.id;
  await h.db.query(`UPDATE reservations SET status = 'EXPIRED', failure_reason = 'HOLD_EXPIRED' WHERE id = $1`, [id]);
  await expect(h.db.query(`UPDATE reservations SET status = 'HELD' WHERE id = $1`, [id])).rejects.toThrow(/illegal reservations status transition/);
  await expect(h.db.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
});
