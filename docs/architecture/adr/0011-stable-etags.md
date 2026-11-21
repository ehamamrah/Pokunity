# ADR-0011: Stable ETags from content, not from responses

**Status:** Accepted (contract v1.1)

## Context
v1.0 marketplace responses carried a weak ETag computed from the full serialised body. Every body
contains `asOf`, which changes whenever the ≤ 5 s snapshot is rebuilt, so the ETag changed on every
refresh even when nothing visible had changed. Clients revalidating after `max-age=5` practically never
received `304`. `/me` and reservation reads had no ETag. Computing an ETag by serialising and hashing
a large body on every request is also wasteful when the answer is "not modified".

## Decision
* An ETag changes **iff something the member sees changes**. Volatile timestamps are excluded from
  fingerprints and returned in a new `X-As-Of` header (on 200 and 304).
* **Input-derived ETags** for marketplace reads (`/jameyas`, `/featured`, `/similar`): the snapshot
  builder computes a content hash once per build (listings + featured ids, without `asOf`). The ETag
  is `H(contentHash, experiment key + variant, typicalMonthlyAmount, preferredDurations, query, page)`.
  A matching `If-None-Match` returns `304` before ranking, presenting or serialising.
* **Body-derived ETags** for small authoritative bodies (detail, `/me`, reservations): hash the body
  without volatile top-level fields (`asOf`, `kycCheckedAt`), serialising once for both the hash and
  the response.
* Reservations hash the full body rather than a row version, because payment transitions do not
  change `reservations.updated_at`.
* `ConditionalGetInterceptor` owns the protocol (ETag, `X-As-Of`, weak `If-None-Match` comparison,
  304). Handlers return a `Conditional { etag, asOf, render() }`.

## Consequences
* Revalidation now yields 304s (detail 12/12, `/me` 12/12, list 7/12 under live churn vs 0/12 before),
  saving 54–92% of bytes and the client-side parse/render.
* Correctness depends on listing **every** ranking input in the list fingerprint. New personal inputs
  must be added to `viewerInputs()`; a test proves the ETag changes when a seat is reserved.
* Snapshot builds pay one extra hash (~10 ms per build, one instance every ~3 s).
* Server-side savings for a 304 are moderate (+28% req/s on the list): auth, revocation checks, rate
  limiting and the viewer lookup still run.

## Alternatives considered
* **Strip volatile fields with a JSON replacer, then hash every response.** Correct but does all the
  rendering work even for 304s.
* **Row versions / `max(updated_at)` per endpoint.** Cheaper, but easy to get wrong (payments,
  personalised ranking, viewer block state live elsewhere).
* **Drop ETags, rely on `max-age`.** Loses revalidation for detail and `/me`, which must be `no-cache`.
