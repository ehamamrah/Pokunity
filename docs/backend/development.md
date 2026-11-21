# Backend Development Guide

## Prerequisites

* Docker (Compose v2). Node 20+ only if you want to run things on the host.
* From the project root, create your local environment file once:

```bash
cp .env.example .env      # then replace the change-me values; .env is git-ignored
```

The backend reads **all** secrets from the environment (`JWT_SECRET`, `PAYMENT_WEBHOOK_SECRET`,
database credentials via `DATABASE_URL`). Nothing secret is baked into the image or the code.
Configuration is validated at boot (`src/shared/config/env.schema.ts`); the process exits with a
readable list of problems if a value is missing or malformed.

## Run with Docker (recommended)

```bash
docker compose up -d --build postgres redis backend
curl http://localhost:4000/api/v1/health
docker compose logs -f backend          # JSON logs, one line per request with requestId
```

On start the container runs `migrate` → `seed` (idempotent, about 1 s for 5,000 Jameyas) → API.
Set `SKIP_SEED=true` to skip seeding.

## Run on the host

```bash
cd backend
npm ci
# point at any PostgreSQL 16 / Redis 7 (compose does not publish their ports by default)
export DATABASE_URL=postgres://<user>:<password>@localhost:5432/pokunity
export REDIS_URL=redis://localhost:6379
export JWT_SECRET=<long random string> PAYMENT_WEBHOOK_SECRET=<random string>
export PAYMENT_WEBHOOK_URL=http://localhost:4000/api/v1/payments/webhook
npm run build && npm run migrate && npm run seed && npm start
```

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | `tsc` → `dist/` (strict TypeScript) |
| `npm start` | `node dist/main.js` |
| `npm run migrate` / `npm run seed` | Apply SQL migrations / idempotent seed |
| `npm run lint` | ESLint over `src/**` and `test/**` (zero errors required) |
| `npm run typecheck` | `tsc --noEmit` including tests |
| `npm test` | Unit tests (2 workers) then integration tests (in band) |
| `npm run test:unit` | Unit tests only (no I/O, a few seconds) |
| `npm run test:integration` | Integration tests, **in band** (real PostgreSQL + Redis; resets `*_test` DB; files share one database) |
| `npm run loadtest:contention` | 1,000 concurrent reservations on one Jameya; asserts invariants |
| `npm run bench` | autocannon benchmark (run via the `backend-bench` compose service, see below) |

Jest transpiles only (`tsconfig.jest.json`, `isolatedModules`); types are checked by
`npm run typecheck` and lint. Type-checking test workers were OOM-killed in the 2 vCPU / 5 GB VM.

## Tests

**In Docker (what CI should run):**

```bash
# from the project root
docker compose -f docker-compose.yml -f backend/docker-compose.test.yml run --rm --build backend-test
```

This builds the `test` stage of `backend/Dockerfile` and runs `npm test` against the compose
PostgreSQL/Redis. It uses an isolated database `<POSTGRES_DB>_test` (dropped and re-migrated each
run) and Redis logical DB 1, so it never touches your dev data. Test secrets are throwaway
values defined in the overlay.

**On the host:** export `DATABASE_URL` (database name **must** end in `_test`; global setup refuses
anything else) and `REDIS_URL` (use a dedicated logical DB), then `npm test`.

**Benchmark** (against the running stack, inside the compose network):

```bash
docker compose -f docker-compose.yml -f backend/docker-compose.test.yml run --rm --build backend-bench
# BENCH_ONLY=<substring> BENCH_SECONDS=10 BENCH_CONNECTIONS=50
```

**Load test** (against the running stack):

```bash
docker compose exec backend npm run loadtest:contention
# LOADTEST_USERS=1000 LOADTEST_SEATS=20 LOADTEST_MODES=spread,same
```

It mints tokens with the container's `JWT_SECRET` (1,000 logins would trip the 5/min/IP login
limit and measure bcrypt, not contention) and verifies the results directly in PostgreSQL.

### What is tested where

| Suite | Covers |
|---|---|
| `src/**/reservation-state-machine.spec.ts`, `payment-state-machine.spec.ts` | Lifecycles, reconciliation verdicts, webhook signatures |
| `src/**/preconditions/handlers.spec.ts` | Eligibility chain order and errors |
| `src/**/circuit-breaker.spec.ts`, `kyc.service.spec.ts` | Breaker states, cache / stale-if-error / single-flight |
| `src/**/idempotency.spec.ts` | Fingerprints, replay / mismatch / in-progress / lease takeover |
| `src/**/ranking.spec.ts`, `listing.spec.ts`, `policies.spec.ts` | Scores, reasons, badges, A/B assignment, filters, sorts, risk and hold limits |
| `test/booking-concurrency.e2e-spec.ts` | Double booking under concurrency (API and raw DB), idempotent double click, hold limit races, eligibility errors |
| `test/payments.e2e-spec.ts` | Duplicate webhooks → single capture, decline, authorized-after-timeout → void, lost webhook → reconciliation, out-of-order, orphan, bad signature |
| `test/expiry.e2e-spec.ts` | Sweeper never expires `PAYMENT_PENDING`, 410 after expiry, zero-fee confirm, cancel rules, DB guard triggers |
| `test/query-count.e2e-spec.ts` | N+1 guards: constant query counts per endpoint regardless of page/item/seat count, set-based sweeper, zero DB work for `/events` |
| `test/http-hardening.e2e-spec.ts` | `RateLimit-*` headers and 429, breaker states in `/health` |
| `test/conditional-get.e2e-spec.ts` | Stable ETags: 304 across a snapshot refresh, ETag changes on seat/reservation/hold changes, `X-As-Of` |
| `test/contract-v1-1.e2e-spec.ts` | `/similar`, reservation pagination, `payment.resolveBy`, `HOLD_LIMIT`, non-empty `traceId` on malformed JSON, `surface: checkout` |
| `test/logout.e2e-spec.ts` | Logout one/all sessions, idempotent 204, Redis-down fail-closed (503) and escalation, rate limit |
| `src/shared/**/*.spec.ts` | Two-tier cache, fallback limiter, conditional GET helpers |

## Coding rules

* **No function, method, or arrow function longer than 15 lines** (blank lines and comments excluded),
  enforced by ESLint `max-lines-per-function` on `src/**` **and** `test/**` with **no
  exemptions**, including test callbacks, helpers, seed, and load-test scripts. Tests use top-level
  `test()` cases with arrange/act helpers in `test/support/`. Files aim for < 200 lines (`max-lines` warning).
* Strict TypeScript; `no-explicit-any` and `no-floating-promises` are errors.
* SQL lives in repositories as named constants with a comment stating the guarantee it provides.
* A module may only inject another module's **facade**; see [modules](../architecture/modules.md).
* Money is always integer minor units.

## Layout

```text
backend/
  migrations/                 forward-only SQL (schema, constraints, guard triggers)
  src/
    main.ts, bootstrap.ts     HTTP app (helmet, CORS, validation, error envelope, shutdown hooks)
    app.module.ts             composition root
    shared/                   config, db, redis, errors, logging, rate limit, jobs, utils
    modules/<name>/           api / application / domain / infrastructure + facade + module
    cli/                      migrate, seed, loadtest-contention
  test/                       integration suites + support (harness, fixtures)
  Dockerfile                  deps → build → test → prod-deps → runtime (non-root, tini)
  docker-compose.test.yml     test runner overlay
```
