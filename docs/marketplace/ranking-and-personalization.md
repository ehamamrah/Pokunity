# Marketplace Ranking & Personalization (Task 2, backend)

Companion docs (frontend team): [UX strategy](ux-strategy.md) · [A/B testing](ab-testing.md) ·
[stale data & optimistic UI](stale-data-and-optimistic-ui.md).
Code: `backend/src/modules/catalog/domain/ranking/`, `catalog/domain/badges.ts`,
`catalog/application/marketplace.service.ts`, `analytics/domain/experiments.ts`.

## 1. Pipeline

```mermaid
flowchart LR
  S[(PostgreSQL)] -- "≤ every 4 s, 1 aggregate query" --> SN[Snapshot<br/>5k listings + featured ids + asOf]
  U[UsersFacade.getPersonalization] --> CTX
  X[assignVariant(userId, ranking_v2)] --> CTX[RankingContext + Strategy]
  SN --> F[Filter specs] --> R[Rank: strategy.rank()] --> O[Sort strategy] --> P[Paginate] --> B[Badges + reasons] --> J[JSON]
  CTX --> R
```

1. **Snapshot** (`CatalogSnapshotService`): all Jameyas with `totalSeats`, `seatsAvailable`,
   `minFee`, `maxFee`, plus active featured campaign ids, refreshed lazily when older than 4 s
   (single-flight). `asOf` = snapshot time, so the response is never more than about 5 s stale.
2. **Viewer context** (`RankingContextFactory`): declared preferences (`typicalMonthlyAmount`,
   `preferredDurations`); if no amount is declared, the **average monthly amount of the member's
   confirmed history** (`user_behavior`). Then the A/B variant and its strategy.
3. **Filter** by specifications (`minMonthly`, `maxMonthly`, `duration`, `q`, `availableOnly`).
4. **Rank** (all matches for `sort=recommended`; for other sorts only the returned page is scored).
5. **Sort** by a strategy per `sort` key with `id` as tie-breaker, so pagination is stable.
6. **Present** with badges and up to 3 human-readable reasons.

## 2. Signals (each normalised to [0, 1])

| Signal | Formula | Personal? |
|---|---|---|
| `amountMatch` | `1 − |monthly − typical| / typical` (clamped); neutral 0.5 if unknown | yes |
| `durationMatch` | `1 − (min distance to a preferred duration) / 6`; neutral 0.5 if none | yes |
| `scarcity` | `1 − seatsAvailable / totalSeats` (social proof, urgency) | no |
| `startingSoon` | 1 if start ≤ 14 days, linear to 0 at 120 days; 0 if started | no |
| `freshness` | `1 − ageDays / 30` | no |
| `featured` | 1 if in an active marketing campaign | no |

## 3. Score and weights per variant

`score = Σ weight(signal) × signal`, rounded to 2 decimals. The weights of each variant sum to 1,
so scores are comparable across variants and stay in [0, 1].

| Signal | `control` (baseline) | `treatment` (`ranking_v2`, personalised) |
|---|---|---|
| amountMatch | 0 | **0.35** |
| durationMatch | 0 | **0.20** |
| scarcity | 0.35 | 0.15 |
| startingSoon | 0.30 | 0.15 |
| freshness | 0.15 | 0.05 |
| featured | 0.20 | 0.10 |

**Reasons.** Contributions are sorted by value. The top ones that pass a threshold are rendered
as text, at most 3:
"Matches your usual monthly amount" (amountMatch ≥ 0.85), "Matches your preferred 12-month
duration", "Only N seats left" (≤ 3), "Starts in N days" (≤ 30), "Newly listed",
"Featured by Pokunity". The control variant never produces personal reasons.

**Badges** (independent of score):
`FEATURED` (active campaign) · `ALMOST_FULL` (≤ 2 seats or ≤ 20% left) · `STARTING_SOON` (≤ 30 days)
· `NEW` (listed ≤ 7 days ago) · `BEST_MATCH` (treatment only: amountMatch ≥ 0.85 and an exact
duration match). `BEST_MATCH` is part of the treatment experience, so it is not shown to control.

## 4. Experiments

* **Assignment:** `bucket = uint32(sha256("ranking_v2:" + userId)[0..4]) mod 100`;
  `treatment` if `bucket < 50`. It is deterministic, sticky, needs no storage, and is identical on
  every instance. It is returned in `meta.experiment` for the frontend to echo in `POST /events`.
* **Strategy pattern:** each variant is a `WeightedRankingStrategy` with its own weights
  (`ranking-strategies.ts`). A new variant needs a weight table and a percentage, nothing else.
* **Events:** client events (`impression`, `click`, `seat_selected`, `checkout_started`) are
  batch-inserted with the attribution the client sent (unattributed events stay `null`). Server
  funnel events (`reservation_created`, `reservation_confirmed`) are written by the backend with
  the member's assigned variant. The table is indexed on `(experiment_key, variant, type)`.

## 5. Featured campaigns (marketing configuration)

`featured_campaigns(jameya_id, campaign, priority, starts_at, ends_at)`. Marketing can schedule
campaigns without a deploy (SQL/admin tool). Active = `now() ∈ [starts_at, ends_at)`.
* `GET /jameyas/featured`: up to 10 active, **non-full** Jameyas in priority order.
* In the main list, `featured` is a ranking signal (weight 0.20 control / 0.10 treatment) and a
  badge. It is not a pin, so a featured but poorly matching Jameya does not crowd out relevant ones.

## 6. Caching and staleness

| Data | Freshness | Mechanism |
|---|---|---|
| List / featured | ≤ 5 s (`asOf`) | Two-tier snapshot cache (L1 in-process ~1 s + L2 Redis ~3 s, single-flight) + ETag/304 + `Cache-Control: private, max-age=5` — see [performance](../performance/backend.md#5-caching) |
| Detail seat map | ≤ 2 s | Redis cache (2 s), deleted on every committed seat change; never read by the booking path |
| Booking | Authoritative | Conditional SQL; Redis gate is advisory |

## 7. Performance at 5,000+ Jameyas

* Snapshot refresh: one `GROUP BY` over about 69k seats, roughly 30–60 ms, at most once per 4 s per instance.
* Per request: filter + score + sort of ≤ 5,000 in-memory objects (each score is about 20
  arithmetic operations), a few milliseconds of CPU, then a 20-item page.
* Memory: about 1 KB per listing, so a few MB per instance.

**Scaling further** (50k–500k Jameyas or many instances):
1. Maintain a `jameya_listing` read model (availability counters updated from seat-change events
   via the outbox) instead of re-aggregating seats.
2. Two-stage ranking: SQL/search engine pre-filters and orders by a **non-personal base score**
   (indexed) to the top ~500 candidates; personal re-ranking applies to candidates only.
3. Share the snapshot through Redis (one refresher, all instances read), or move to
   OpenSearch for text search and filters.
4. Learn the weights (logistic regression / LTR) from the `analytics_events` funnel per variant.
