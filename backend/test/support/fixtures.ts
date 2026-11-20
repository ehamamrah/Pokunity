import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TokenService } from '../../src/modules/auth/infrastructure/token.service';
import { signPayload } from '../../src/modules/payments/domain/webhook-signature';
import { Harness } from './harness';

export interface Member {
  id: string;
  token: string;
}

export interface MemberOptions {
  kyc?: 'VERIFIED' | 'PENDING';
  risk?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export async function createMember(h: Harness, opts: MemberOptions = {}): Promise<Member> {
  const id = randomUUID();
  await h.db.query(`INSERT INTO users (id, email, name, password_hash, risk_tier) VALUES ($1, $2, 'Test Member', 'x', $3)`, [
    id, `${id}@test.pokunity.app`, opts.risk ?? 'LOW',
  ]);
  await h.db.query('INSERT INTO kyc_simulator_profiles (user_id, status) VALUES ($1, $2)', [id, opts.kyc ?? 'VERIFIED']);
  const token = await h.app.get(TokenService).issue({ id, email: `${id}@test.pokunity.app` });
  return { id, token };
}

export function createMembers(h: Harness, count: number): Promise<Member[]> {
  return Promise.all(Array.from({ length: count }, () => createMember(h)));
}

/** A Jameya whose seat n costs (seats - n) * 1000 halalas; the last seat is free. */
export async function createJameya(h: Harness, seats = 10): Promise<string> {
  const { rows } = await h.db.query<{ id: string }>(
    `INSERT INTO jameyas (code, name, monthly_amount, duration_months, start_date)
     VALUES ($1, 'Test Jameya', 100000, $2, '2027-01-01') RETURNING id`, [`T-${randomUUID()}`, seats]);
  await h.db.query(`INSERT INTO seats (jameya_id, seat_number, fee, status)
     SELECT $1, s, ($2 - s) * 1000, 'AVAILABLE' FROM generate_series(1, $2) s`, [rows[0].id, seats]);
  return rows[0].id;
}

export function reserve(h: Harness, m: Member, jameyaId: string, seatNumber: number, key: string = randomUUID()) {
  return h.http.post('/api/v1/reservations').set('Authorization', `Bearer ${m.token}`)
    .set('Idempotency-Key', key).send({ jameyaId, seatNumber });
}

export function checkout(h: Harness, m: Member, reservationId: string, token: string): request.Test {
  return h.http.post(`/api/v1/reservations/${reservationId}/checkout`).set('Authorization', `Bearer ${m.token}`)
    .set('Idempotency-Key', randomUUID()).send({ paymentMethodToken: token });
}

export function getReservation(h: Harness, m: Member, id: string): request.Test {
  return h.http.get(`/api/v1/reservations/${id}`).set('Authorization', `Bearer ${m.token}`);
}

export function sendWebhook(h: Harness, event: object, secret = process.env.PAYMENT_WEBHOOK_SECRET as string) {
  const body = JSON.stringify(event);
  return h.http.post('/api/v1/payments/webhook').set('Content-Type', 'application/json')
    .set('X-Pokunity-Signature', signPayload(body, secret)).send(body);
}
