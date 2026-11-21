# Modules

The backend is a **modular monolith**: one deployable, several modules with hard boundaries.
Each module lives in `backend/src/modules/<name>/` and follows the same layering:

```text
<module>/
  api/             controllers + request DTOs (HTTP adapter)
  application/     use cases / application services / jobs (orchestration, transactions)
  domain/          pure logic: state machines, policies, specifications, strategies (no I/O)
  infrastructure/  repositories (SQL), external adapters (simulators, Redis)
  <module>.facade.ts   the module's PUBLIC API (the only thing other modules may inject)
  <module>.module.ts   Nest wiring; `exports` lists the public surface
```

## Boundary rules

1. **A module only touches its own tables.** All SQL against a table lives in that module's
   `infrastructure/` folder.
2. **Cross-module calls go through exported facades** (Nest `exports`). Repositories are never exported.
3. **Shared transactions without shared tables (Unit of Work).** When two modules must change
   state atomically (for example, claim a seat and insert a reservation), the caller opens the
   transaction and passes a `SqlExecutor` to the other module's facade method. The SQL still
   belongs to the owning module.
4. **No dependency cycles.** When a lower-level module must trigger behaviour in a higher-level
   one, it declares a port and the higher-level module implements it (`ReservationSettlement`).
5. **No cross-module foreign keys.** Tables in different modules reference each other by UUID
   only, so a module can be extracted into a service with its data.

How the rules are enforced: Nest only resolves injected providers that a module exports, so
importing a repository from another module fails at boot. The DAG is visible in each
`*.module.ts` `imports` array, and code review rejects deep imports of another module's
`infrastructure/`. A next step is `eslint-plugin-boundaries` (or `dependency-cruiser`) in CI to
make the import rules mechanical.

## Catalogue

### `shared` (kernel, not a business module)

Config validation (`zod`), `Database` (pool + `transaction()`), `RedisService`, `Clock`, error
model and contract exception filter, JSON logger + request context, Redis rate limiter + guard,
`JobRunner` (overlap and cluster-exclusive execution), timeout helper, `BreakerRegistry` +
`CircuitBreaker`, `TwoTierCache`, conditional GET (`Conditional`, `ConditionalGetInterceptor`: stable
ETags, `X-As-Of`, 304; see [caching](../performance/caching.md)), `@SessionPolicy` metadata.

### `auth`

| | |
|---|---|
| Responsibility | Login (bcrypt), JWT issue/verify (`jti`, `ver`), global `JwtAuthGuard` (`@Public()` opt-out, `@SessionPolicy('strict' \| 'allow-revoked')`), logout: Redis jti denylist + token versions ([ADR-0012](adr/0012-token-revocation.md)). |
| Public API | `TokenService` (used by tests and the load-test token minting). |
| Tables | none (denylist keys `auth:revoked:<jti>` in Redis; `users.token_version` behind `UsersFacade`) |
| Depends on | `users` (`findCredentials`, `tokenVersionOf`, `revokeAllSessions`), `audit` |
| Endpoints | `POST /auth/login` (5/min/IP + 10/15 min/email), `POST /auth/logout` (10/min/member) |

### `users`

| | |
|---|---|
| Responsibility | Profile and preferences, behavioural counters, risk tier, **KYC resolution** (port + simulator adapter + Redis cache + circuit breaker + single-flight), hold-limit and risk policies. |
| Public API | `UsersFacade`: `findCredentials`, `getProfile`, `getEligibility` (KYC + risk + `maxActiveHolds`), `getPersonalization`, `isSeatRestricted`, `recordExpiredHolds(tx)`, `recordConfirmedReservation(tx)`, `kycHealth`. |
| Tables | `users`, `user_behavior`, `kyc_simulator_profiles` (simulator data) |
| Depends on | shared |

### `catalog`

| | |
|---|---|
| Responsibility | Jameyas, seats, featured campaigns; ≤ 5 s in-memory marketplace snapshot; ranking (A/B strategies), badges, filters, sorts; viewer-specific seat map; **seat inventory mutations**; Redis availability gate and its rebuild job. |
| Public API | `CatalogFacade`: `findForBooking`, `admit` (gate), `claimSeat(tx)`, `releaseSeats(tx)`, `markSeatTaken(tx)`, `onSeatsChanged`. |
| Tables | `jameyas`, `seats`, `featured_campaigns` |
| Depends on | `users` (eligibility, preferences), `analytics` (experiment assignment) |
| Endpoints | `GET /jameyas`, `GET /jameyas/featured`, `GET /jameyas/{id}`, `GET /jameyas/{id}/similar` (all conditional: stable ETag + `X-As-Of`) |

### `reservations`

| | |
|---|---|
| Responsibility | Reservation lifecycle (state machine), eligibility chain, create / checkout / cancel use cases, expiry sweeper; implements `ReservationSettlement` for payments. |
| Public API | `ReservationsFacade.activeHoldsCount`; `ReservationSettlementService` is registered into payments at module init. |
| Tables | `reservations` |
| Depends on | `catalog`, `users`, `payments`, `analytics`, `audit`, `idempotency` |
| Endpoints | `POST/GET /reservations` (GET paginated: `page`, `pageSize` ≤ 50, `meta.total`), `GET/DELETE /reservations/{id}`, `POST /reservations/{id}/checkout`. Reserve and checkout are `@SessionPolicy('strict')`; GETs are conditional (ETag + `X-As-Of`). |

### `payments`

| | |
|---|---|
| Responsibility | Payment records, `PaymentGateway` port + **Payment Provider Simulator** adapter, HMAC webhook intake, exactly-once event processing, append-only ledger, transactional outbox relay (capture/void), reconciliation. |
| Public API | `PaymentsFacade`: `open(tx)`, `requestAuthorization`, `summariesFor`, `registerSettlement`. Port: `ReservationSettlement`. |
| Tables | `payments`, `payment_events`, `ledger_entries`, `payment_outbox`, `simulator_payment_intents` (simulator data) |
| Depends on | `audit` |
| Endpoints | `POST /payments/webhook` (signature-guarded, public) |

### `idempotency`

| | |
|---|---|
| Responsibility | Contract idempotency semantics for mutating booking endpoints (claim, replay, in-progress, key reuse, crash takeover via lease). |
| Public API | `IdempotencyInterceptor` (`@UseInterceptors`) |
| Tables | `idempotency_keys` |

### `analytics`

| | |
|---|---|
| Responsibility | Deterministic A/B assignment (`sha256(key:userId)`), client event ingestion (batch insert), server funnel events. |
| Public API | `AnalyticsFacade`: `rankingExperimentFor`, `ingestClientEvents`, `trackServerEvent` |
| Tables | `analytics_events` |
| Endpoints | `POST /events` |

### `audit`

| | |
|---|---|
| Responsibility | Append-only audit trail written **inside** the business transaction. |
| Public API | `AuditFacade.record(entry, tx?)` |
| Tables | `audit_log` (UPDATE / DELETE / TRUNCATE rejected by trigger) |

### `account` (composition only)

`GET /me` combines `UsersFacade` (profile, KYC, limits) and `ReservationsFacade` (active holds).
Keeping this read model outside `users` avoids a `users → reservations` cycle. Owns no tables.

### `health`

`GET /health`: database and Redis pings, KYC breaker state (`degraded` never fails the probe).
