# ADR-0008: In-memory marketplace snapshot for ranking

**Status:** Accepted

## Context
`GET /jameyas` ranks 5,000+ Jameyas per member (personal signals, A/B variant) with filters
and sorts. Listing may be ≤ 5 s stale.

## Decision
Each instance keeps a snapshot of all listings (one aggregate query, about 30–60 ms for 5k
Jameyas / 69k seats) and refreshes it lazily when older than 4 s, with single-flight. Filtering,
scoring, and sorting run in memory (well under 10 ms for 5k rows), and then the page is sliced.
`asOf` is the snapshot time. Detail pages and the booking path read PostgreSQL directly.

## Consequences
* Predictable latency, no per-request heavy SQL, and per-member ranking with no cache explosion.
* Memory is about a few MB per instance. Each instance issues at most one aggregate query per 4 s.
* Scale-out path (100k+ Jameyas): a precomputed `jameya_listing` read model updated from seat
  events, a candidate pre-filter in SQL (top N by base score per filter), and per-member
  re-ranking of only the candidates. See [ranking](../../marketplace/ranking-and-personalization.md).

## Alternatives considered
* **SQL ORDER BY with a score expression.** Personal signals per request make indexes useless; a full scan is needed every time.
* **Redis-cached pages per member.** Cardinality explodes (member × filters × sort × page).
