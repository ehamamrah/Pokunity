# Backend Performance and Resilience

**Method:** benchmark, change, benchmark again with the same harness. Prove "no N+1" with tests that count queries. Re-run the 1,000-user test after every booking-path change.

```bash
docker compose -f docker-compose.yml -f backend/docker-compose.test.yml run --rm --build backend-bench
```

## Results

5,000 Jameyas, 50 connections, 10 s per scenario, one laptop. Use the numbers to compare, not to plan capacity.

| Endpoint | req/s before → after | p99 ms before → after |
|---|---|---|
| `GET /jameyas` recommended | **106 → 1,647** (15.5×) | 884 → 67 |
| `GET /jameyas` page 5 | **103 → 1,635** | 3,833 → 56 |
| `GET /jameyas` filtered | 1,097 → 1,676 | 70 → 58 |
| `GET /jameyas/{id}` | 1,406 → 1,994 | 96 → 58 |
| `POST /events` | 1,388 → 1,658 | 75 → 58 |
| `GET /me` | 1,971 → 2,223 | 45 → 44 |
| `GET /jameyas/{id}/similar` | 1,022 → 1,659 | 135 → 67 |

The big win is the personalised list: it used to aggregate seats and score 5,000 Jameyas on every request. Already-cheap endpoints stayed flat, because each request now also pays for rate limiting and session checks.

A `304` revalidation serves about 1,900 req/s on the list, detail and `/me` ([caching](caching.md)). The 1,000-user test still gives **0 double bookings** ([results](../contention/high-contention.md#load-test)).

## No N+1 queries

`backend/test/query-count.e2e-spec.ts` asserts each endpoint's query count stays constant as data grows.

| Where | Before | After |
|---|---|---|
| Marketplace snapshot | Aggregated ~69k seat rows | Totals and fee range stored on `jameyas`; index-only availability count |
| Jameya detail | Several round trips | Seat map in one query, viewer in one query |
| `GET /reservations` | One payment lookup per row | One joined query |
| `GET /me` | Several lookups | Exactly 2 queries |
| Hold sweeper | Row by row | One set-based update per batch |
| `POST /events` | Insert per request | Buffered: 0 queries per request, 1 per flush |

**Deliberately not stored:** seat availability on `jameyas`. Every seat claim would lock the same parent row and serialise the 1,000-user rush.

Also: statement and idle-transaction timeouts on the pool, plus prepared statements on hot paths.

## Caching

| Data | Cache | Invalidation | Used by booking? |
|---|---|---|---|
| Marketplace snapshot | In-process 1 s + Redis 3 s | Time (≤ 5 s allowed) | No |
| Ranked list per variant and filters | Memoised per snapshot | New snapshot | No |
| Seat map | Redis 2 s | Deleted on every seat change | Never |
| KYC status | Redis ~10 min (24 h if KYC is down) | Time | Yes, fails closed |
| Seat counter (gate) | Redis, rebuilt every 10 s | Updated after commit | Advisory only |

Plus stable ETags, `304`s and gzip/brotli over 1 kB. Full explanation: [caching](caching.md).

## Rate limits

A Redis sliding window (Lua). If Redis is down, each instance limits locally: it fails over to a local limit, never to no limit. Responses carry `RateLimit-*` headers, and `429` adds `Retry-After`.

| Endpoint | Limit | Per |
|---|---|---|
| Any request | `RATE_LIMIT_IP_PER_10S` per 10 s | IP |
| Login | 5 / min, and 10 / 15 min | IP, and email |
| Logout | 10 / min | member |
| Reserve | 5 / 10 s | member |
| Checkout | 10 / min | member |
| Cancel | 10 / 10 s | member |
| Poll reservation | 60 / 10 s | member |
| List reservations | 30 / 10 s | member |
| Events | 60 / 10 s | member |
| Webhook | 300 / 10 s | IP |

Source: `backend/src/shared/http/rate-limit/policies.ts`.

## Circuit breakers

Closed → open after repeated failures → one trial request → closed. States appear in `GET /health`.

| Dependency | When open |
|---|---|
| KYC provider | Serve cached status; none cached → `503 KYC_UNAVAILABLE` (booking only) |
| Payment provider | Commands wait in the outbox; the member sees "pending", never a false failure |
| Redis | Caches read from PostgreSQL; gate and lock fail open; local rate limiter |

## Async work

| Task | How | Guarantee |
|---|---|---|
| Authorize, capture, void | Outbox, committed with the decision | Never lost on a crash; settled at most once |
| Analytics events | Buffered, flushed every 250 ms or 500 events | Best effort (never money) |
| Ranking signals | Computed once per snapshot | ≤ 5 s old |
| Hold expiry, reconciliation | Set-based jobs, one instance at a time | – |

## Limitations

- In-process cache and breaker state are per instance; the in-process cache adds up to 1 s of age (still inside 5 s).
- Buffered analytics events are lost if the process is killed hard (not on a normal shutdown).
- The per-IP limiter adds one Redis round trip to every request.
