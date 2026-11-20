# ADR-0006: KYC — fail closed, cached, circuit-broken

**Status:** Accepted

## Context
Reserving requires verified identity (regulated). The KYC vendor can be slow or down;
`noura@pokunity.app` always times out.

## Decision
* `KycService` resolves status: fresh Redis cache (10 min) → provider call with a 1.5 s timeout,
  behind a **circuit breaker** (open after 5 consecutive failures, 15 s, half-open single probe)
  and **single-flight** per member → on error, serve the cached value if younger than 24 h
  (**stale-if-error**) → otherwise `UNKNOWN`, with a 15 s negative marker so we do not hammer the vendor.
* Booking requires `VERIFIED`. `UNKNOWN` gives `503 KYC_UNAVAILABLE`; `PENDING`/`REJECTED` give `403 KYC_REQUIRED`.
* Browsing never needs KYC. `/me` shows `kycStatus: UNKNOWN`, and the detail page shows
  `blockingReason: KYC_UNAVAILABLE`.

## Consequences
* A vendor outage blocks only members without a recent verification.
* The breaker is per instance (in-memory). That is acceptable: each instance protects its own resources.
* A revoked verification can take effect up to 10 min late. A vendor webhook that invalidates the
  cache is the production fix.

## Alternatives considered
* **Fail open (allow booking when KYC is unknown).** Not acceptable for a regulated product.
* **Synchronous KYC with no cache.** Vendor latency would land on every request.
