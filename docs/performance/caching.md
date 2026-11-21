# Stable Caching: ETags, `304 Not Modified` and `X-As-Of`

> Contract: [README "Conditional requests"](../api/README.md#conditional-requests-etag-and-freshness) (v1.1).
> Decision record: [ADR-0011 Stable ETags](../architecture/adr/0011-stable-etags.md).
> Related: [backend performance](backend.md) · [two-tier cache (ADR-0009)](../architecture/adr/0009-two-tier-cache.md).

## 1. What an ETag is

An **ETag** is a short fingerprint of a response's content that the server sends in a header:

```http
HTTP/1.1 200 OK
ETag: W/"6iKuEGO1kQayJRMy-w6Vhtp1M7E"
X-As-Of: 2026-11-21T11:15:54.112Z
Cache-Control: private, max-age=5
```

Next time, the client sends the fingerprint back in `If-None-Match`. If the content has not
changed, the server answers **`304 Not Modified` with no body**, and the client reuses its copy.
This is called a *conditional request*, or *revalidation*. A 304 saves the download, the JSON
parsing and the re-render in the browser. On our side it also saves rendering and serialising the
response, and for marketplace lists it saves the ranking.

`W/` marks a **weak** ETag: two responses with the same weak ETag are *semantically* equal, even if
the bytes differ (gzip vs brotli, key order). That is the right notion for JSON APIs.

## 2. Why the old ETag was useless

v1.0 hashed the **whole serialised body**. Every marketplace response contains `asOf`, the moment
the snapshot was built, and the snapshot is rebuilt every few seconds. So the ETag changed on
**every refresh even when nothing visible had changed**. A client revalidating after its 5 s
`max-age` almost never got a `304`. `/me` and the reservation reads had no ETag at all.

Measured on the same stack, with the same responses, polling every 5 s like the UI (12 revalidations):

| Endpoint | Old body-hash ETag would have matched | Stable ETag (v1.1) → `304` |
|---|---|---|
| `GET /jameyas/{id}` | **0 / 12** | **12 / 12** |
| `GET /jameyas` (page 1, 20 items) | **0 / 12** | **7 / 12** (5 genuine changes: live seat activity changed counts and ranking during the run) |
| `GET /me` | no ETag (always 200) | **12 / 12** |

## 3. How stable ETags are computed

**Rule: the ETag changes if and only if something the member sees changes.** Timestamps that only
say "when we last looked" are excluded from the fingerprint and carried in the `X-As-Of` header
instead.

Two techniques, chosen per endpoint:

* **Input-derived (no rendering needed).** For marketplace reads, the response is fully determined
  by the snapshot's *content* plus the viewer's ranking inputs plus the query. The snapshot builder
  computes a **content hash once per build** (SHA-1 over all listings and featured ids, *excluding*
  `asOf`). The ETag is a hash of `(contentHash, variant, personalisation inputs, query)`. When it
  matches `If-None-Match`, we answer `304` **before ranking, building reasons or serialising
  anything**.
* **Body-derived (one serialisation).** For small, per-member, authoritative bodies, we hash the body
  without its volatile top-level fields. The body is serialised **once**: the stable part is hashed,
  and the volatile fields are appended to the same string for the response.

| Endpoint | Technique | Fingerprint inputs | Excluded (volatile) | `Cache-Control` | `X-As-Of` |
|---|---|---|---|---|---|
| `GET /jameyas` | input-derived | snapshot content hash, experiment key + variant, `typicalMonthlyAmount`, `preferredDurations`, `sort`, filters, `page`, `pageSize` | `asOf` (body, items, meta) | `private, max-age=5` | snapshot build time |
| `GET /jameyas/featured` | input-derived | snapshot content hash, experiment, personalisation | `asOf` | `private, max-age=5` | snapshot build time |
| `GET /jameyas/{id}/similar` | input-derived | snapshot content hash, experiment, personalisation, target id | `asOf` | `private, max-age=5` | snapshot build time |
| `GET /jameyas/{id}` | body-derived | whole detail: summary, seat statuses, `heldByViewer`, restrictions, `viewer` block (KYC, `HOLD_LIMIT`, active reservation), experiment | `asOf` | `private, no-cache` | seat-map read time |
| `GET /me` | body-derived | profile, KYC status, risk tier, preferences, limits | `kycCheckedAt` | `private, no-cache` | now |
| `GET /reservations` | body-derived | page items incl. payments, `meta` | — (full body) | `private, no-cache` | now |
| `GET /reservations/{id}` | body-derived | reservation incl. payment | — (full body) | `private, no-cache` | now |

Code: `backend/src/shared/http/conditional.ts`, `conditional-get.interceptor.ts`,
`catalog/application/catalog-snapshot.service.ts` (content hash), `marketplace.service.ts`.

Why the personal inputs are part of the list fingerprint: the same snapshot ranks differently for a
member with other preferences or another A/B variant, and the reasons ("Matches your usual monthly
amount") and the `BEST_MATCH` badge are personal. Day-dependent values ("Starts in 9 days", `NEW`) come
from base signals computed into the snapshot, so they change the content hash when the day changes.

Why reservations hash the full body rather than `max(updated_at)`: payment transitions (for example
`AUTHORIZED → CAPTURED`) do not touch `reservations.updated_at`, so a row-version ETag would hide
visible changes. Hashing a page of at most 50 reservations is cheap, and correctness wins over cleverness.

## 4. `X-As-Of`

`X-As-Of` (ISO-8601) is **when the server last verified the data**, and it is sent on **both `200` and
`304`**. A `304` therefore still moves the freshness indicator forward ("updated 2 s ago"), even
though no body was sent. The body `asOf` fields remain for backward compatibility. They are
excluded from fingerprints because they would otherwise defeat them.

## 5. Request flow (browser → BFF → backend)

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (HTTP cache)
  participant F as Next.js BFF
  participant A as Backend API
  participant C as Snapshot cache (L1/L2)
  B->>F: GET /api/v1/jameyas?page=1
  F->>A: GET (Bearer, X-Request-Id)
  A->>C: snapshot (contentHash, listings)
  A->>A: ETag = H(contentHash, variant, prefs, query)
  A->>A: rank page, render JSON
  A-->>F: 200 + body, ETag W/"abc", X-As-Of T1, max-age=5
  F-->>B: 200 (headers passed through)
  Note over B: within 5 s: served from the browser cache, no request
  B->>F: GET (If-None-Match: W/"abc")
  F->>A: GET (If-None-Match: W/"abc")
  A->>C: snapshot (rebuilt at T2, same content → same contentHash)
  A->>A: ETag = W/"abc" (unchanged) → no ranking, no rendering
  A-->>F: 304 Not Modified, ETag W/"abc", X-As-Of T2
  F-->>B: 304, X-As-Of T2
  Note over B: reuses its stored body; UI shows "updated just now" (T2)
```

## 6. Invalidation: what changes an ETag

| Change | Lists / featured / similar | Detail | `/me` | Reservations |
|---|---|---|---|---|
| A seat is held, released, confirmed (anyone) | next snapshot (≤ 4 s) → new content hash | immediately: seat map cache entry deleted on commit | — | — |
| My hold count changes | — | yes (`viewer.blockingReason` / `HOLD_LIMIT`, `activeReservationId`) | yes (`limits.activeHolds`) | yes |
| Reservation or payment status changes | — | if it changes my seat view | — | yes (full body) |
| Featured campaign starts/ends | next snapshot | yes (`featured`, badge) | — | — |
| A new day (relative dates, `NEW` badge) | next snapshot | yes | — | — |
| My preferences, A/B variant | yes (inputs) | yes (ranking/reasons) | yes (preferences) | — |
| KYC re-check with the same result | — | — | **no** (`kycCheckedAt` excluded) | — |
| Snapshot rebuilt, nothing changed | **no** (same content hash) | — | — | — |

## 7. Correctness guarantees

* **The booking path is never cached.** `POST /reservations`, checkout and cancel read and write
  PostgreSQL in transactions. Nothing above feeds them. A stale or cached view can at worst show a
  seat as available that is gone; the booking answers `409 SEAT_UNAVAILABLE`.
* **Reservation reads are authoritative.** They are computed from PostgreSQL on every request. The
  ETag only avoids re-sending an unchanged body; it never serves old data.
* **Staleness bound unchanged.** Marketplace data is at most 5 s old (L1 1 s + L2 3 s, jittered),
  which `X-As-Of` reports honestly.
* **Weak comparison** (RFC 9110): `W/"x"` matches `"x"` and `W/"x"`; `If-None-Match: *` and lists are
  supported.
* Tests (`backend/test/conditional-get.e2e-spec.ts`): same ETag across a snapshot refresh with no
  data change → `304` with `X-As-Of` and an empty body; detail ETag changes after someone reserves a
  seat; reservation ETag changes after cancel; `/me` ETag ignores `kycCheckedAt` but changes with the
  hold count. Unit tests cover weak comparison and volatile-field exclusion.

## 8. Measured impact

Bench: `npm run bench` (autocannon, 50 connections, 10 s per scenario, inside the compose network,
2 vCPUs shared by API, PostgreSQL, Redis and the load generator).

| Scenario | req/s | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|---:|
| `GET /jameyas` page 1 → 200 | 1,477 | 30 | 52 | 72 |
| `GET /jameyas` page 1 revalidate → **304** | 1,890 | 25 | 37 | 48 |
| `GET /jameyas/{id}` → 200 | 1,610 | 29 | 41 | 54 |
| `GET /jameyas/{id}` revalidate → **304** | 1,869 | 28 | 37 | 50 |
| `GET /me` → 200 | 1,780 | 27 | 36 | 48 |
| `GET /me` revalidate → **304** | 1,991 | 26 | 37 | 53 |

Reading the numbers:

* A 304 is **cheaper but not free** on the server (+28% req/s for the list): authentication, the
  revocation check, rate limiting and the viewer's preference lookup still run, because they decide
  *which* ETag applies. The big win is on the wire and in the client.
* **Bytes** (uncompressed, 12 revalidations each, from §2): list 122.3 KB → 56.4 KB (−54%, with real
  data churn), detail 24.6 KB → 1.9 KB (−92%), `/me` 3.8 KB → 0.3 KB (−92%). A `304` has no body.
* In the browser, a `304` means no JSON parsing and, combined with the frontend's structural sharing,
  no re-render (see the frontend section).

## Frontend

The browser is the first cache. The frontend is built so that it uses the browser's HTTP cache for
reads, revalidates with the contract's ETags, and keeps the freshness indicator truthful even when
nothing in the body changed.

### What the browser does

| Read | Response from the BFF | What happens |
|---|---|---|
| Marketplace list, featured, similar | `Cache-Control: private, max-age=5`, `ETag`, `X-As-Of` | Fresh for 5 s from the browser cache. After that the browser sends `If-None-Match`; an unchanged result comes back as `304`, and the browser serves its stored body. |
| Jameya detail (seat map) | `Cache-Control: private, no-cache`, `ETag`, `X-As-Of` | Revalidated on every use. A `304` is served from the browser cache without downloading the seat map again. |
| `/me` | `Cache-Control: private, no-cache`, `ETag` | Revalidated on use; unchanged profiles cost one small round trip with no body. |
| Reservations, checkout status | No ETag caching (authoritative) | Always fetched. |

The application requests reads with the default fetch cache mode and writes with `no-store`. Nothing
in application code sends `If-None-Match` by hand: the browser does, because the response carries an
`ETag`. A `304` therefore never reaches JavaScript as a `304`. The browser merges the headers from the
`304` into its stored response, and the page sees a normal `200`.

### Freshness: `X-As-Of`

The "Availability updated Xs ago" line reads the `X-As-Of` header, which the server sends on `200` and
`304` alike. A revalidated response with unchanged content therefore still moves the timestamp
forward, and the line keeps counting from the last time the server checked. The body's `asOf` is the
fallback for responses without the header.

### Structural sharing: no re-render for unchanged data

When a refetch returns the same content, TanStack Query keeps the existing object references, so
unchanged Jameyas are not re-rendered. The only object that changes is the list envelope (its
`asOf`). Each card is memoized, so a refetch re-renders only the cards whose data changed. Tests lock
this in (`structural-sharing.test.ts`): unchanged items keep their reference, and a changed item is
the only one replaced.

### Server prefetch

The first page of Jameyas, the featured list, the profile and the detail are fetched on the server
and hydrated into the client cache with the same query keys and functions. Hydrated data carries its
original `dataUpdatedAt`, so the client does not refetch on mount while the data is within its
`staleTime`. The first paint therefore has data, and revalidation works from the first navigation.

### What the user sees

* **Unchanged data:** no flicker, no re-render, and a freshness line that keeps counting correctly.
* **Changed data:** the changed card updates; the others stay as they were.
* **Session ended on another device:** the next request returns `401`. The app clears its cache,
  and the user lands on sign-in with a "session ended" notice and a return path (`next`).
* **Log out of all devices:** every token is revoked, and the browser's HTTP cache is cleared
  (`Clear-Site-Data: "cache"`), so the next member on this browser cannot see the previous member's
  responses.
