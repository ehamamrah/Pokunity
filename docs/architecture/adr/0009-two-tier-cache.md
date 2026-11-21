# ADR-0009: Two-tier cache (in-process + Redis) with single-flight

**Status:** Accepted · **Extends:** [ADR-0008](0008-in-memory-marketplace-snapshot.md)

## Context

ADR-0008 kept the marketplace snapshot in each instance's memory. With several instances, each
one rebuilt the snapshot from PostgreSQL independently, and a cold start or expiry made every
concurrent request trigger its own rebuild (cache stampede). The personalised list measured
~106 req/s with a 3.8 s p99 tail.

## Decision

- `TwoTierCache` in the shared kernel: **L1** in-process (~1 s) in front of **L2** Redis (~3 s),
  TTLs jittered ±20 % to avoid synchronised expiry.
- **Single-flight:** one loader per key per instance; across instances a short Redis refresh
  lock lets one instance reload while the others briefly wait for its result.
- Redis access goes through the Redis circuit breaker; when it is open the cache loads directly
  from PostgreSQL (correct, just slower).
- Used for the marketplace snapshot and the seat map (L2 only, 2 s, deleted on every committed
  seat change). The booking path never reads a cache.

## Consequences

- Personalised list: ~106 → ~1,650 req/s, p99 884 ms → 67 ms ([benchmarks](../../performance/backend.md#2-results-same-laptop-docker-desktop-5000-jameyas--69k-seats)).
- Worst-case staleness = L1 + L2 ≈ 4 s, inside the 5 s budget.
- More moving parts (lock, jitter, breaker); covered by unit tests of the cache.

## Alternatives considered

- **Redis only:** one network hop per request for a ~5,000-item snapshot; L1 removes it.
- **Materialised view refreshed by cron:** still per-request scoring cost, and refresh locking.
- **CDN/edge cache:** responses are personalised per member, so hit rates would be poor.
