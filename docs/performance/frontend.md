# Frontend Performance and Resilience

**Headline:** the marketplace now makes **zero API calls from the browser on first load**, because data arrives in the HTML. The BFF also fails fast when the backend is unhealthy. Bundle size went up slightly (by 4–5 kB), on purpose.

## Results

Lighthouse 12, mobile preset, one run per page, against the Docker stack. Small differences are noise.

| Page | Score | LCP | Requests |
|---|---|---|---|
| `/` marketplace | 99 → 99 | 2.2 → 2.1 s | **24 → 17** |
| `/jameyas/[id]` | 98 → 99 | 2.4 → 2.2 s | 23 → 20 |
| `/login` | 99 → 99 | 2.1 → 2.0 s | 17 → 17 |

| Measure | Before | After |
|---|---|---|
| API calls during `/` load | 3 | **0** |
| Per-card prefetch requests | 1 per visible card | **0** (warm on hover instead) |
| Mock code in the production bundle | ~290 kB | **0** (a build check fails if it leaks) |
| Backend down, circuit open | Requests hang | `503` in ~7 ms, no backend call |

## What changed

| Problem | Fix |
|---|---|
| Data fetched only after the JS loaded | Server prefetch, hydrated into TanStack Query |
| Next.js prefetched every visible card | Prefetch off; warm the detail once on hover or focus |
| Mock service worker shipped to production | Build-time flags exclude it; `check:bundle` guards it |
| Empty flash on filter change | Keep previous data while loading |
| One request per keystroke | 300 ms debounce |
| Cards re-rendered on every refetch | `React.memo` and structural sharing |
| Long lists painted off-screen cards | `content-visibility: auto` |
| Retries fired in lockstep | Jittered backoff; `Retry-After` honoured |
| Clicks after a `429` hit the server again | Writes held locally until `Retry-After` |
| Polling in hidden tabs | Paused; refetch on return |
| New connection per BFF request; no timeout | Keep-alive pool, 10 s timeout (`504`), circuit breaker (`503`) |

**Not done in the BFF: compression.** Next.js strips `Content-Encoding` from route-handler responses, so gzipped bytes would reach the browser unreadable. Compression belongs to the proxy or CDN in front of Next. A regression test makes sure the BFF never encodes bodies.

## Refresh policy

| Data | Fresh for | Refetch while visible | Hidden tab |
|---|---|---|---|
| `/me` | 60 s | – | – |
| List, featured | 5 s | every 12 s | paused |
| Seat map | 5 s | every 5 s | paused |
| Reservation status | 0 | 1.5 s → 3 s while paying, 5 s while held | paused |
| My reservations | 0 | every 15 s | paused |

Reads use the browser HTTP cache and revalidate with ETags; writes use `no-store` ([caching](caching.md#in-the-browser)).

## BFF resilience

1. **Circuit breaker:** after 5 failures in a row (connection, timeout, 500/502/504) it opens for 10 s and answers `503` with `Retry-After`, then lets one trial request through. A `503` from the backend doesn't count, because it can be a real answer (`KYC_UNAVAILABLE`).
2. **Keep-alive pool:** 128 connections.
3. **Timeout:** 10 s, then `504 UPSTREAM_TIMEOUT`.

## Limits

- Bundle +4–5 kB on `/` and detail, for server prefetch.
- `/` is rendered per request, because it reads the session cookie.
- No list virtualisation; worth adding if sessions pass ~200 cards.
- CLS 0.032 on `/`, under the 0.1 threshold.
- Breaker state is per replica.
- Single Lighthouse runs; no real-user monitoring yet. The e2e test uses Node `fetch`, not a real browser.

## Reproduce

```bash
cd frontend && npm run build:verified        # build + fail if mock code leaked
npm run e2e                                  # 18 checks through the running stack
npx -y lighthouse@12 http://localhost:3000/ --only-categories=performance \
  --extra-headers='{"Cookie":"pokunity_session=<token>"}'
```
