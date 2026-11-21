# Frontend Performance and Resilience

This document records how the frontend was measured, what changed, and what the numbers say. The
honest headline: the browser now makes **no API calls on first load** of the marketplace, and the
BFF fails fast when the backend is unhealthy. Bundle size did not go down; it went up slightly,
for the reasons in [section 6](#6-trade-offs-and-limits).

## 1. Method

- **Lighthouse 12**, performance category, mobile preset (default simulated throttling), one run per
  page, run against the running docker stack. Scores are a single sample, so treat differences of a
  few points or tens of milliseconds as noise.
- **Requests per load** are the request count Lighthouse reports for the page.
- **API calls at load** are the `/api/v1/*` requests the browser makes during the page load, read from
  the Lighthouse network log.
- **Bundle sizes** are the `next build` First Load JS per route. Total client JS is the sum of
  `.next/static/chunks/**/*.js`.
- Measurement script and raw JSON are kept in the working scratchpad, not the repo. Commands are in
  section 7.

## 2. Before and after

Baseline is commit `c391c33`. Final is `e0aa4db` plus this doc commit. Same machine, same stack.

| Page | Perf score (before → after) | LCP | TBT | CLS | Requests | Script transferred |
|---|---|---|---|---|---|---|
| `/` (marketplace) | 99 → 99 | 2.2 s → 2.1 s | 30 ms → 20 ms | 0.001 → 0.032 | **24 → 17** | 158 kB → 157 kB |
| `/jameyas/[id]` | 98 → 99 | 2.4 s → 2.2 s | 20 ms → 0 ms | 0 → 0 | 23 → 20 | 169 kB → 173 kB |
| `/login` | 99 → 99 | 2.1 s → 2.0 s | 0 ms → 30 ms | 0 → 0 | 17 → 17 | 145 kB → 150 kB |

LCP is almost flat because the simulated mobile network dominates it and the page was already fast.
The real improvement is in what happens after the HTML arrives, which Lighthouse does not score.

| Measure | Before | After |
|---|---|---|
| API calls made by the browser during `/` load | 3 (`me`, `featured`, list) | **0** (data hydrated from HTML) |
| Per-card RSC prefetch requests on `/` | 2 (one per visible card) | **0** |
| Requests to `/favicon.ico` | 404 | 200 (`app/icon.svg`) |
| Server-rendered `/` payload | No data in HTML | First page of Jameyas in HTML |
| First page of Jameyas through the BFF | 9,668 B (uncompressed) | 9,668 B — compression moved to the edge proxy (see fix 4) |
| Static asset caching | `public, max-age=31536000, immutable` (unchanged) | Same, verified |

Bundle (`next build`, First Load JS):

| Route | Before | After | Note |
|---|---|---|---|
| `/` | 147 kB | 151 kB | +4 kB: hydration boundary, server prefetch code path |
| `/jameyas/[id]` | 156 kB | 161 kB | +5 kB: detail now prefetched; marketplace view chunk preloaded (see §6) |
| `/reservations/[id]` | 147 kB | 147 kB | |
| `/reservations` | 140 kB | 140 kB | |
| `/login` | 140 kB | 143 kB | |
| Shared by all routes | 103 kB | 103 kB | |

Resilience measurements:

| Scenario | Result |
|---|---|
| Backend unreachable, 5 consecutive failures | Each request gets a fast 503 envelope (about 7 to 75 ms) |
| Circuit open (6th request onward) | Immediate 503 with `Retry-After: 10`, about 6 to 8 ms, no backend call |
| Gzip of the first list page | Decompresses to 20 items, byte-for-byte (unit test) |
| Conditional GET with `If-None-Match` | Header forwarded to the backend (unit test); see §4 for the 304 caveat |

## 3. What was wrong, and what changed

| # | Finding (measured) | Cause | Change | Commit |
|---|---|---|---|---|
| 1 | Two extra detail-page requests on the marketplace, one per visible card | Next's automatic `<Link>` prefetch fetches the RSC payload of each visible link (N+1-style) | `prefetch={false}` on data-bearing links; explicit warm-up on hover or focus, deduplicated by the query cache | `ed265fa`, `4d3ab39` |
| 2 | Waterfall: three API calls started only after the JS bundle loaded | Data was fetched on mount in the client | Server component prefetches `me`, featured and the first list page in parallel; HTML is hydrated with the data | `ed265fa` |
| 3 | `GET /favicon.ico` returned 404 | No icon | `app/icon.svg` | `4d3ab39` |
| 4 | API responses were not compressed | Route handlers do not gzip; the BFF relayed decoded bodies | ~~Streaming gzip in the BFF~~ **reverted**: Next.js strips `Content-Encoding` from route-handler responses, so browsers received gzip bytes labelled as JSON and every client-side call failed to parse. Compression belongs to the reverse proxy / CDN in front of Next (nginx, ALB, CloudFront). A regression test (`proxy-encoding.test.ts`) asserts the BFF never encodes bodies. | `e0aa4db`, reverted in the fix commit |
| 5 | MSW (about 290 kB) and fixtures were emitted into the production client bundle | An unset `NEXT_PUBLIC_*` stays a runtime lookup; the dev branch survived | Build-time env literals, `IgnorePlugin` on `src/mocks` when mocking is off, and `npm run check:bundle` to fail a build that leaks | `467dae5` |
| 6 | Filter changes flashed an empty list | Query key change cleared data | `keepPreviousData` on the list | `ed265fa` |
| 7 | One request per keystroke in search | Search applied on every change | 300 ms debounce; an applied-search ref prevents overwriting newer typing | `5088978` |
| 8 | Cards re-rendered on every refetch | No memoization | `React.memo` on the card; stable impression ledger per page view | `ed265fa` |
| 9 | Long lists would lay out and paint every card | No containment | `content-visibility: auto` with intrinsic size on cards | `e0aa4db` |
| 10 | Freshness line appeared after mount and moved the layout | Rendered only after mount | Line height reserved | `e0aa4db` |
| 11 | Retries of reads and writes fired in lockstep | Fixed exponential delay | Jittered backoff (equal jitter), `Retry-After` honored and capped at 30 s | `4d3ab39` |
| 12 | A burst of clicks after a 429 re-hit the server | No client-side limit | Write gate closes for the server's `Retry-After`; reads are not gated | `4d3ab39` |
| 13 | Background polling kept running while the tab was hidden | Default was `true` on the checkout page | Polling pauses while hidden; focus or visibility triggers an immediate refetch. The result is authoritative, so nothing is lost | `4d3ab39` |
| 14 | Analytics flushed on the main thread and could grow without bound during an outage | Timer-based flush, requeue forever | Flush when idle; queue dropped after 3 consecutive failed sends; queue capped at 200 | `4d3ab39` |
| 15 | Each BFF request opened a new connection; a sick backend hung requests | Default fetch, no timeout, no breaker | Keep-alive pool, 10 s timeout (504), circuit breaker (503 + `Retry-After`) | `b161140` |

## 4. Caching and polling policy

| Resource | Where it is read | `staleTime` | Refetch while visible | While hidden | `gcTime` | Notes |
|---|---|---|---|---|---|---|
| `GET /me` | Auth hook, KYC banner | 60 s | none | not refetched | 5 min | Changes rarely; re-checked on navigation |
| `GET /jameyas/featured` | Carousel | 5 s | 12 s | paused | 5 min | Server-prefetched |
| `GET /jameyas` (list, infinite) | Marketplace | 5 s | 12 s | paused | 5 min | Server-prefetched first page; `keepPreviousData` |
| `GET /jameyas/{id}` (seat map) | Detail | 5 s | 5 s | paused | 5 min | Server-prefetched; polls for holds placed by others |
| `GET /reservations/{id}` | Checkout | 0 s | 1.5 s, then 3 s while `PAYMENT_PENDING`; 5 s while `HELD` | paused | 5 min | Stops on any terminal status; refetches at once on return |
| `GET /reservations` | My reservations | 0 s | 15 s | paused | 5 min | |
| Hover or focus on a card | Marketplace | 5 s (via detail) | n/a | n/a | 5 min | One warm-up per card per 5 s; deduplicated |

Two HTTP-level rules sit under this table:

- **Reads may use the browser HTTP cache** (`cache: 'default'`). The backend's `Cache-Control: private,
  max-age=5` and any `ETag` are honored by the browser. Writes always use `no-store`.
- **Conditional requests pass through the BFF.** `If-None-Match` is forwarded, and `304` is relayed.
  The backend's ETags currently change with every response (`asOf`, `kycCheckedAt`), so 304 rarely
  hits for `/me` and the list. See §6.

## 5. BFF resilience

All backend traffic goes through one client (`src/server/bff/backend-client.ts`), including server
prefetch and the login route. It applies, in order:

1. **Circuit breaker.** Five consecutive connection failures, timeouts or `500`/`502`/`504` responses
   open the circuit for 10 s. While open, requests get a `503` envelope with `Retry-After` and do not
   reach the backend. After 10 s one probe is admitted (half-open). Success closes the circuit; failure
   reopens it. `503` is deliberately not counted, because the backend also uses it for
   `KYC_UNAVAILABLE`, which is a domain answer.
2. **Keep-alive pool.** An undici `Agent` with 128 connections and a 30 s keep-alive, so connections are
   reused across requests.
3. **Timeout.** 10 s per call. A timeout becomes `504` with the contract error envelope.
4. **Header policy.** Forwarded: `Accept`, `Content-Type`, `Idempotency-Key`, `If-None-Match`,
   `X-Request-Id` (generated if absent). Relayed: status, body, `ETag`, `Cache-Control`, `Retry-After`,
   `Idempotent-Replayed`, `RateLimit-*`, `X-Request-Id`. Dropped: `Set-Cookie` and hop-by-hop headers.
5. **Compression.** Not done in the BFF. Next.js removes `Content-Encoding` from route-handler
   responses (`FORBIDDEN_HEADERS` in `next/dist/server/send-response.js`), so a hand-gzipped body
   reaches the browser undecodable. Bodies are streamed as-is (decoded by undici); compression is
   the job of the edge proxy / CDN in production. Guarded by `src/server/bff/proxy-encoding.test.ts`.

The breaker state is per process. With several replicas each one detects failure independently; that
is acceptable at this scale and is noted as a limit.

## 6. Trade-offs and limits

- **Bundle size went up slightly.** Server prefetch and hydration add code to the routes that use them,
  and the detail page preloads the marketplace view chunk. Next preloads dynamic imports reachable from
  a page's module graph, and both pages import the marketplace feature index. Removing that needs a
  separate shared catalog module, which I did not do. The trade-off is taken on purpose: the seat map
  arrives in the HTML instead of after a client round trip.
- **The home page is now dynamic** (`ƒ`). It reads the session cookie to prefetch per user, so it cannot
  be a static page. It was never cacheable across users anyway.
- **No list virtualization.** Infinite scroll loads 20 cards per page. `content-visibility: auto` skips
  layout and paint for offscreen cards. Virtualize if a session routinely passes about 200 cards.
- **No `next/font`.** The app uses the system font stack. That means no font download and no font-swap
  layout shift, at the cost of exact typography across platforms.
- **ETag 304 rarely hits.** Conditional GET works end to end, but the backend's ETags include
  time-varying fields. Stable-content ETags on `GET /jameyas` and `GET /me` would make 304 common.
  Recorded as a backend request in `docs/api/change-requests.md`.
- **CLS of 0.032 on `/`.** The "Recommended for you" section moves slightly as the marketplace view mounts
  after hydration. Under the 0.1 threshold. A fixed-height placeholder would remove it.
- **Checkout polling pauses while the tab is hidden.** The payment result is authoritative, so the page
  refetches as soon as it is visible again. A payment that settles while the tab is hidden shows on
  return, not in a notification.
- **The 504 status is outside the contract's status table.** The body uses the contract envelope with
  `INTERNAL_ERROR`. Recorded as a gap.
- **Single Lighthouse run per page**, mobile preset, simulated throttling. No field data (RUM) yet.
- **Two JSON-level limits from v1.1:** `504` and `503` for BFF errors are now the contract's
  `UPSTREAM_TIMEOUT` and `SERVICE_UNAVAILABLE` codes, and the rate-limit headers are relayed.

## 6a. Contract v1.1 changes (caching, logout, similar, pagination)

v1.1 changes what the frontend can rely on, and this section records what changed and how it was
verified. The full caching design is in
[caching-frontend-section.md](caching-frontend-section.md).

| Change | Effect on the browser | How it is verified |
|---|---|---|
| `ETag` and `X-As-Of` on reads, `304` relayed | The browser revalidates; unchanged content costs one small round trip; the freshness line still moves on `304` | e2e steps 3 and 4 (`304`), unit `freshness-source.test.ts` |
| Structural sharing kept | Unchanged cards are not re-rendered | `structural-sharing.test.ts` |
| `GET /jameyas/{id}/similar` | Inline list on a full Jameya; lazy strip below the seat map, fetched only when visible | e2e step 5; `lazy-similar.test.tsx` (no request before visible) |
| Reservation pagination | One page (20) per request, `keepPreviousData` keeps the page on screen | e2e step 7; `reservation-pagination.test.tsx` |
| `payment.resolveBy` | Deadline shown while pending; no request added | `paying-notice.test.tsx` |
| Logout with revocation | Cache, analytics and cookie cleared; old token rejected at the backend | e2e steps 8 and 9 |

The end-to-end run is `npm run e2e` in `frontend/` against the running docker stack. It goes through
the BFF with gzip negotiated, as a browser does. Results on the final v1.1 build: **18 of 18 checks
passed**: login (httpOnly cookie, no token in the body), list decoding through gzip, ETag and
`X-As-Of` on reads, `304` on revalidation, detail `experiment`, similar (at most five, excluding the
source), reserve with an idempotent replay, checkout polled to a server-confirmed `CONFIRMED`,
paginated reservations, logout (`204`, cookie cleared, `Clear-Site-Data`), the revoked token rejected
with `401` at the backend, the old cookie rejected at the BFF, and logout-all revoking a session from
another login.

Two honest limits of the measurement. The e2e client is Node's `fetch`, not a real browser, so the
browser's HTTP cache is verified by the contract and by unit tests rather than by observing a browser
cache. And the backend's `X-As-Of` on a `304` can repeat the previous timestamp when the backend served
its own verified cache (within 5 s); the header is still present and correct.

## 7. Reproducing the measurements

```bash
cd frontend && npm run build:verified            # build, then fail if mock code leaked
cd .. && docker compose up -d --build            # full stack
# Lighthouse per page (needs Chrome and a session cookie for authed pages):
npx -y lighthouse@12 http://localhost:3000/ --only-categories=performance --output=json \
  --extra-headers='{"Cookie":"pokunity_session=<token from POST /api/session>"}'
```

Tests that lock these behaviors in: `request-budget.test.tsx` (zero requests for N cards, one warm-up per
hover), `circuit-breaker.test.ts`, `backend-client.test.ts`, `backoff.test.ts`, `rate-gate.test.ts`,
`polling-policy.test.ts` (no polling while hidden), `filter-debounce.test.tsx`, `proxy-encoding.test.ts` (BFF never encodes bodies),
and `idle.test.ts`.
