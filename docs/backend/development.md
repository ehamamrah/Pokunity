# Backend Development

Running the whole stack and seeding: see the [README](../../README.md#how-to-run). All commands run from the project root unless noted.

## Run only the backend

```bash
docker compose up -d --build postgres redis backend
curl http://localhost:4000/api/v1/health
docker compose logs -f backend      # JSON logs with requestId
```

On start the container runs: migrate → seed → API. Set `SKIP_SEED=true` to skip the seed.

**On the host** (needs your own PostgreSQL 16 and Redis 7; compose doesn't publish their ports):

```bash
cd backend && npm ci
export DATABASE_URL=postgres://<user>:<password>@localhost:5432/pokunity REDIS_URL=redis://localhost:6379
export JWT_SECRET=<random> PAYMENT_WEBHOOK_SECRET=<random> PAYMENT_WEBHOOK_URL=http://localhost:4000/api/v1/payments/webhook
npm run build && npm run migrate && npm run seed && npm start
```

Config is validated at startup (`src/shared/config/env.schema.ts`). The process exits with a clear list if anything is missing.

## Tests

```bash
# Unit + integration, in Docker, against an isolated <db>_test database and Redis DB 1
docker compose -f docker-compose.yml -f backend/docker-compose.test.yml run --rm --build backend-test

# Benchmark against the running stack
docker compose -f docker-compose.yml -f backend/docker-compose.test.yml run --rm --build backend-bench

# 1,000-user contention test against the running stack
docker compose exec backend npm run loadtest:contention
```

On the host, `npm test` needs a database whose name ends in `_test` (anything else is refused).

| Suite | Proves |
|---|---|
| `test/booking-concurrency` | No double booking under concurrency, even bypassing Redis; idempotent double click; hold-limit races |
| `test/payments` | Duplicate webhooks → one capture; decline; late authorization → void; lost webhook → reconciliation; bad signature |
| `test/expiry` | Sweeper never expires `PAYMENT_PENDING`; 410 after expiry; database guard triggers |
| `test/query-count` | No N+1: constant query counts per endpoint |
| `test/conditional-get` | Stable ETags, 304s, `X-As-Of` |
| `test/logout` | One or all sessions; Redis down → reads work, reserve/checkout 503 |
| `test/http-hardening`, `contract-v1-1` | Rate-limit headers, breakers, v1.1 contract additions |
| `src/**/*.spec.ts` | State machines, eligibility chain, breaker, idempotency, ranking, cache |

## Scripts

| Script | Does |
|---|---|
| `build` / `start` | Compile to `dist/` / run it |
| `migrate` / `seed` | Apply migrations / idempotent seed |
| `lint` / `typecheck` | ESLint (zero errors) / `tsc --noEmit` |
| `test`, `test:unit`, `test:integration` | All / unit only / integration only |
| `loadtest:contention`, `bench` | Contention test / HTTP benchmark |

## Coding rules

- **At most 15 lines per function**, including tests. ESLint enforces it with no exceptions.
- Strict TypeScript; `any` and unhandled promises are errors.
- SQL lives in repositories as named constants, each commented with the guarantee it provides.
- Modules use each other only through facades ([modules](../architecture/modules.md)).
- Money is always integer minor units.
