import { Pool } from 'pg';

export interface LoadUser {
  id: string;
  email: string;
}

const CREATE_JAMEYA = `
  INSERT INTO jameyas (code, name, monthly_amount, duration_months, start_date)
  VALUES ($1, $2, 100000, $3, (date_trunc('month', now()) + interval '1 month')::date) RETURNING id`;

const CREATE_SEATS = `
  INSERT INTO seats (jameya_id, seat_number, fee, status)
  SELECT $1, s, CASE WHEN s <= $2 * 0.75 THEN (($2 - s + 1) * 1000)::bigint ELSE 0 END, 'AVAILABLE'
  FROM generate_series(1, $2) s`;

/** A brand-new Jameya per run so results are reproducible and independent of the seed. */
export async function createArena(pool: Pool, seats: number): Promise<string> {
  const code = `LOADTEST-${Date.now()}`;
  const { rows } = await pool.query<{ id: string }>(CREATE_JAMEYA, [code, `Contention Arena ${seats}M`, seats]);
  await pool.query(CREATE_SEATS, [rows[0].id, seats]);
  return rows[0].id;
}

export async function loadUsers(pool: Pool, count: number): Promise<LoadUser[]> {
  const { rows } = await pool.query<LoadUser>(
    `SELECT id, email FROM users WHERE email LIKE 'loadtest+%' ORDER BY split_part(split_part(email, '+', 2), '@', 1)::int LIMIT $1`,
    [count],
  );
  if (rows.length < count) throw new Error(`need ${count} loadtest users, found ${rows.length} (SEED_LOADTEST_USERS)`);
  return rows;
}

/** DB-level verification of the invariants (independent of what the API answered). */
export async function verify(pool: Pool, jameyaId: string) {
  const q = (sql: string) => pool.query<{ n: number }>(sql, [jameyaId]).then((r) => r.rows[0].n);
  return {
    seatsWithMultipleLiveReservations: await q(`SELECT count(*)::int AS n FROM (SELECT seat_number FROM reservations
      WHERE jameya_id = $1 AND status IN ('HELD','PAYMENT_PENDING','CONFIRMED') GROUP BY seat_number HAVING count(*) > 1) x`),
    heldReservations: await q(`SELECT count(*)::int AS n FROM reservations WHERE jameya_id = $1 AND status = 'HELD'`),
    heldSeats: await q(`SELECT count(*)::int AS n FROM seats WHERE jameya_id = $1 AND status = 'HELD'`),
    orphanSeats: await q(`SELECT count(*)::int AS n FROM seats s WHERE s.jameya_id = $1 AND s.status = 'HELD' AND NOT EXISTS
      (SELECT 1 FROM reservations r WHERE r.id = s.reservation_id AND r.status = 'HELD')`),
    availableSeats: await q(`SELECT count(*)::int AS n FROM seats WHERE jameya_id = $1 AND status = 'AVAILABLE'`),
  };
}
