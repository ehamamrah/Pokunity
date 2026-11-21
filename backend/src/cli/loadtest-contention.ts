import { Pool } from 'pg';
import { createArena, LoadUser, loadUsers, verify } from './loadtest/fixture';
import { attempt, Attempt, cancel, clientIp } from './loadtest/fire';
import { mintToken } from './loadtest/jwt';
import { printReport, summarize } from './loadtest/report';

/**
 * High-contention test: N distinct, KYC-verified members hit ONE Jameya at the same instant.
 *   mode=spread : member i asks for seat (i mod seats)+1  (realistic: everyone clicks a seat)
 *   mode=same   : everybody asks for seat 1                (worst case: one hot row)
 * Asserts: no seat has >1 live reservation, #201 == #HELD seats, and (spread) all seats got held.
 */
const env = {
  baseUrl: process.env.LOADTEST_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  users: Number(process.env.LOADTEST_USERS ?? 1000),
  seats: Number(process.env.LOADTEST_SEATS ?? 20),
  modes: (process.env.LOADTEST_MODES ?? 'spread,same').split(','),
  secret: process.env.JWT_SECRET ?? '',
};

async function fireAll(users: LoadUser[], tokens: string[], jameyaId: string, mode: string): Promise<Attempt[]> {
  const seatOf = (i: number) => (mode === 'same' ? 1 : (i % env.seats) + 1);
  return Promise.all(users.map((_, i) => attempt(env.baseUrl, tokens[i], jameyaId, seatOf(i), clientIp(i))));
}

async function runMode(pool: Pool, users: LoadUser[], tokens: string[], mode: string): Promise<boolean> {
  const jameyaId = await createArena(pool, env.seats);
  const started = performance.now();
  const results = await fireAll(users, tokens, jameyaId, mode);
  const summary = summarize(results, performance.now() - started);
  const db = await verify(pool, jameyaId);
  const created = results.filter((r) => r.status === 201).length;
  const expectedHolds = mode === 'same' ? 1 : env.seats;
  const ok = db.seatsWithMultipleLiveReservations === 0 && created === db.heldSeats && db.orphanSeats === 0 && created === expectedHolds;
  printReport(`${env.users} users -> 1 Jameya (${env.seats} seats), mode=${mode}`, summary, { ...db, apiHolds201: created, expectedHolds, PASS: ok });
  await Promise.all(results.map((r, i) => (r.reservationId ? cancel(env.baseUrl, tokens[i], r.reservationId) : null)));
  return ok;
}

async function main(): Promise<void> {
  if (!env.secret) throw new Error('JWT_SECRET is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  try {
    const users = await loadUsers(pool, env.users);
    const tokens = users.map((u) => mintToken(u, env.secret));
    const outcomes: boolean[] = [];
    for (const mode of env.modes) outcomes.push(await runMode(pool, users, tokens, mode));
    if (outcomes.includes(false)) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: Error) => {
  console.error(error);
  process.exit(1);
});
