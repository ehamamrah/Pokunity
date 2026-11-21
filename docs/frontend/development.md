# Frontend Development

Next.js 15, React 19, TypeScript (strict), Tailwind 4, TanStack Query 5, zod, Vitest, MSW. Requires Node 20.9+.

## Run

```bash
cd frontend && npm ci
npm run dev                                   # http://localhost:3000, needs the backend on :4000
NEXT_PUBLIC_API_MOCKING=enabled npm run dev   # no backend: in-browser mock API (log in as sara)
```

In Docker, the whole stack runs with `docker compose up --build` from the root ([README](../../README.md#how-to-run)).

## Scripts

| Script | Does |
|---|---|
| `dev` / `build` / `start` | Dev server / production build / run the build |
| `lint` | ESLint, zero warnings allowed |
| `typecheck` | `tsc --noEmit` |
| `test` / `test:watch` | Vitest once / in watch mode |
| `e2e` | Smoke test through the running Docker stack |

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `BACKEND_INTERNAL_URL` | `http://localhost:4000` | Where the BFF forwards `/api/v1/*` (read at runtime) |
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` | Browser API base |
| `NEXT_PUBLIC_API_MOCKING` | `disabled` | `enabled` starts the mock API |
| `COOKIE_SECURE` | from request protocol | Force the cookie's `Secure` flag |

## Tests

MSW mocks the network with a stateful in-memory backend, so tests follow the same contract as the real API.

| Area | Covers |
|---|---|
| `shared/` | Money and time formatting, idempotency keys, API client errors, retries, `Retry-After` |
| `reservations/` | Error messages for every code, polling policy |
| `checkout/` | State machine; a `202` never shows success |
| `jameya-detail/` | Seat restrictions, keyboard seat map, optimistic hold and rollback |
| `marketplace/` | URL filters, search debounce, pagination |
| `analytics/` | Batching, flush on hide, re-queue on failure |
| `server/bff/` | Cookie, headers, breaker, no re-compression |

## Lint rules

- **At most 15 lines per function**, component, hook or test callback. No overrides, tests included.
- Features are imported only through their `index.ts`; `shared/` never imports a feature.
- No `any`, no floating promises; `jsx-a11y` accessibility rules on.
