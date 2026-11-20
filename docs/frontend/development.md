# Frontend Development Guide

Stack: Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, TanStack Query 5,
zod 3, Vitest 3 with React Testing Library, MSW 2.

## Prerequisites

- Node.js 20.9 or newer (the Docker image uses `node:20-alpine`).
- npm (the lockfile is committed; use `npm ci` for reproducible installs).

## Scripts

Run from `frontend/`.

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server on port 3000 |
| `npm run build` | Production build (`output: 'standalone'`) |
| `npm run start` | Runs the standalone server after a build |
| `npm run lint` | ESLint over the whole project, zero warnings allowed |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm test` | Vitest, single run (jsdom, MSW for network) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run mock:init` | Regenerates `public/mockServiceWorker.js` (only after an MSW upgrade) |

## Environment

| Variable | Scope | Default | Purpose |
|---|---|---|---|
| `BACKEND_INTERNAL_URL` | server, runtime | `http://localhost:4000` | Where the BFF proxies `/api/v1/*`. Docker sets `http://backend:4000`. |
| `NEXT_PUBLIC_API_BASE_URL` | browser, build | `/api/v1` | Client base URL (same-origin BFF). |
| `NEXT_PUBLIC_API_MOCKING` | browser, build | `disabled` | `enabled` starts the MSW mock backend (see below). |
| `COOKIE_SECURE` | server, runtime | derived from the request protocol | `true` or `false` overrides the session cookie `Secure` flag. |

See `.env.example`.

## Lint rules

`npm run lint` must report zero problems. The configuration is in `eslint.config.mjs`.

- **15-line functions.** `max-lines-per-function` allows at most 15 non-blank, non-comment lines
  per function, component, hook, arrow function, `describe` and `it` callback, in any file. This is the rule that drives the component
  decomposition: a container calls a hook, and presentational pieces are small components.
- **Feature boundaries.** Deep imports into a feature are rejected; `shared/` may not import features.
- **Type-aware rules.** `no-floating-promises`, `no-explicit-any`, `consistent-type-imports`, and the
  recommended `unbound-method` and `require-await` checks, with no test-only relaxations.
- **Accessibility.** `eslint-plugin-jsx-a11y` recommended, plus the React hooks rules.

**The 15-line rule applies to all code, including tests.** Test files, `src/test/` and `src/mocks/`
are held to the same limit as production code, with no overrides. Tests are kept within it by:

- Flat top-level `it` blocks, instead of a `describe` wrapping many cases.
- Small arrange helpers and fixture builders, and `it.each` tables where cases repeat.
- Splitting MSW handlers into per-resource factory functions.

## Tests

```bash
npm test
```

| Suite | Covers |
|---|---|
| `shared/lib/money.test.ts` | Minor-unit formatting, SAR input parsing, rejects fractional amounts |
| `shared/lib/time.test.ts` | Countdown formatting, freshness ("updated Xs ago"), UTC dates |
| `shared/lib/idempotency.test.ts` | Key reuse on retry; new key on new intent; fresh key after settle |
| `shared/api-client/client.test.ts` | Typed errors from the envelope, contract validation, `Idempotency-Key` header, retry policy and `Retry-After` |
| `features/reservations/model/error-strategy.test.ts` | Error code to message strategy; every contract code has copy |
| `features/reservations/model/poll-policy.test.ts` | Checkout polling: fast, back-off, and stop on terminal status |
| `features/checkout/model/checkout-machine.test.ts` | Transitions idle to confirmed, sticky terminal states, no optimistic success |
| `features/checkout/components/CheckoutSession.test.tsx` | 202 never shows success; confirmed only from the server; decline copy |
| `features/jameya-detail/model/seat-presentation.test.ts` | Restriction rendering, precedence, optimistic overlay, nearest-seat suggestions |
| `features/jameya-detail/components/SeatMap.test.tsx` | Restricted seats disabled with reason; radio-group keyboard selection |
| `features/jameya-detail/hooks/reserve-flow.test.tsx` | Same key across automatic retry; new key for a new seat; optimistic hold rolled back on 409; navigation on success |
| `features/analytics/model/event-batcher.test.ts` | Flush at 20 events, interval flush, beacon on hide, requeue on failure, experiment attribution |
| `features/marketplace/model/filters.test.ts` | URL round-trip, invalid input falls back, search length rule, pagination positions |
| `server/bff/proxy.test.ts` | Bearer from cookie, idempotency forwarded, header relay, cookie attributes |

MSW intercepts the network in tests. The handlers in `src/mocks/` are stateful (they model
idempotent replay, seat conflicts, holds, and provider outcomes), so the tests exercise the same
contract as the real backend. Each test resets the in-memory store.

## Mock mode

`NEXT_PUBLIC_API_MOCKING=enabled npm run dev` starts an MSW service worker in the browser and
serves the contract from an in-memory backend, so the UI runs without the backend. It is off by
default and is dead code in production builds.

- Seeded viewer: Sara (verified, low risk). Five payment tokens behave as documented.
- Session: the mock login route accepts `sara@pokunity.app` / `Pokunity123!`. The cookie is not
  set in mock mode, and the middleware is bypassed so the demo can be opened directly.
- Restricted-seat behavior: set `db.viewerRisk = 'HIGH'` in `src/mocks/db.ts` to see `RISK_TIER`.

## Docker

The image is multi-stage: deps, build, then a non-root `node:20-alpine` runner that starts
`node server.js` on `PORT=3000`, `HOSTNAME=0.0.0.0`.

```bash
docker build -t pokunity-frontend ./frontend         # from the project root
docker compose up -d --build                         # full stack, see root docker-compose.yml
docker compose down
```

The compose service sets `BACKEND_INTERNAL_URL=http://backend:4000`. The proxy reads it at request
time, so the same image works in any environment.
