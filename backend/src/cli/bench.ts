import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { loadUsers } from './loadtest/fixture';
import { mintToken } from './loadtest/jwt';
import { runScenario } from './bench/runner';
import { buildScenarios, Scenario } from './bench/scenarios';
import { BenchResult, toMarkdown } from './bench/stats';

/**
 * HTTP benchmark of the hot read endpoints and /events (autocannon, devDependency).
 * Run inside the compose network:  docker compose -f docker-compose.yml -f backend/docker-compose.test.yml run --rm backend-bench
 * Knobs: BENCH_BASE_URL, BENCH_SECONDS (10), BENCH_CONNECTIONS (50), BENCH_OUT (json file), BENCH_ONLY (substring).
 */
const env = {
  baseUrl: process.env.BENCH_BASE_URL ?? 'http://localhost:4000',
  seconds: Number(process.env.BENCH_SECONDS ?? 10),
  connections: Number(process.env.BENCH_CONNECTIONS ?? 50),
  out: process.env.BENCH_OUT,
  only: process.env.BENCH_ONLY,
};

async function prepare(pool: Pool): Promise<{ tokens: string[]; jameyaId: string }> {
  const users = await loadUsers(pool, 1000); // stay under per-member limits (e.g. 30 list calls / 10 s)
  const tokens = users.map((u) => mintToken(u, process.env.JWT_SECRET ?? ''));
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM jameyas WHERE code = 'DEMO-RIYADH'`);
  return { tokens, jameyaId: rows[0].id };
}

/** Revalidation scenarios: one member, the ETag of a previous 200 → every request should be a 304. */
async function optionsFor(s: Scenario, tokens: string[]): Promise<{ tokens: string[]; headers?: Record<string, string> }> {
  if (!s.revalidate) return { tokens };
  const res = await fetch(`${env.baseUrl}${s.path}`, { headers: { authorization: `Bearer ${tokens[0]}` } });
  return { tokens: [tokens[0]], headers: { 'if-none-match': res.headers.get('etag') ?? '' } };
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const { tokens, jameyaId } = await prepare(pool).finally(() => pool.end());
  const scenarios = buildScenarios(jameyaId).filter((s) => !env.only || s.name.includes(env.only));
  const results: BenchResult[] = [];
  for (const s of scenarios) {
    results.push(await runScenario(s, { ...env, ...(await optionsFor(s, tokens)) }));
    console.log(JSON.stringify(results.at(-1)));
  }
  console.log(`\n${toMarkdown(results)}`);
  if (env.out) await writeFile(env.out, JSON.stringify(results, null, 2));
}

main().catch((error: Error) => {
  console.error(error);
  process.exit(1);
});
