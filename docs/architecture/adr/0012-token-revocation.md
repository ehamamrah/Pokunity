# ADR-0012: Token revocation with a jti denylist and token versions

**Status:** Accepted (contract v1.1)

## Context

Access tokens are stateless HS256 JWTs (1 h). A stolen token stayed valid until expiry, and "log out"
only deleted the BFF cookie. A regulated money product needs server-side revocation of one session
and of all sessions, without adding a database query to every request.

## Decision

* Every token carries a unique `jti` and the member's `ver` (token version at issue time).
* **This session:** `POST /auth/logout` stores `auth:revoked:<jti>` in Redis with TTL = remaining
  token lifetime, so the denylist never outlives the tokens it blocks.
* **All sessions** (`allSessions: true`): bump `users.token_version` (migration 0003). Tokens with an
  older `ver` are rejected.
* The global guard checks both. Token versions come from PostgreSQL through a 5 s per-instance cache.
* **Redis down**: the version check still works (PostgreSQL). The denylist status is "unknown":
  reads proceed; money-moving routes (`@SessionPolicy('strict')`: reserve, checkout) **fail closed**
  with `503 SERVICE_UNAVAILABLE` + `Retry-After: 5`. 503 rather than 401, so that a Redis blip does
  not log every member out; no money moves on an unverifiable session.
* A single-session logout that cannot reach Redis is **escalated** to all sessions (token version
  bump): revoking more than asked is safe, silently revoking nothing is not.
* Logout is idempotent (204) and accepts an already revoked token (`@SessionPolicy('allow-revoked')`).
  It is rate limited (10/min/member) and audited (`auth.logout.session` / `auth.logout.all_sessions`).

## Consequences

* Revocation of one session takes effect immediately on every instance. "All sessions" is immediate
  on the serving instance and within ≤ 5 s on the others (version cache TTL).
* Tokens minted before v1.1 (no `jti`/`ver`) count as version 0 and cannot be denylisted
  individually; they expire within an hour of the deploy.
* One Redis `EXISTS` per authenticated request (through the Redis breaker); the DB version lookup is
  amortised by the cache.

## Alternatives considered

* **Server-side sessions only (opaque tokens).** Simple revocation, but a DB/Redis read is then
  mandatory for every request and the contract specifies JWTs.
* **Short-lived access + refresh tokens.** Recommended next step; it shortens the exposure window but
  still needs a denylist for immediate logout.
* **Token version only.** One mechanism, but "log out this device" would log out every device.
