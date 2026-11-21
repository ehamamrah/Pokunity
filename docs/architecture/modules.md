# Backend Modules

One deployable, with hard boundaries between modules. Each module in `backend/src/modules/<name>/` has the same layout:

```text
api/             controllers and request DTOs
application/     use cases, transactions, jobs
domain/          pure logic: state machines, policies (no I/O)
infrastructure/  SQL repositories, Redis, provider adapters
<name>.facade.ts the only thing other modules may use
```

## Boundary rules

1. A module only queries its own tables.
2. Other modules call it through its facade; repositories are never exported.
3. If two modules must change data in one transaction, the caller opens it and passes it to the other's facade. Each module still runs only its own SQL.
4. No dependency cycles. A lower module that must trigger a higher one declares a port (`ReservationSettlement`).
5. No foreign keys across modules, only UUID references, so a module can be split out later.

NestJS enforces rule 2: injecting a provider that a module doesn't export fails at startup.

## Catalogue

| Module | Owns | Responsible for | Public API |
|---|---|---|---|
| `auth` | (Redis denylist) | Login, JWT, logout and revocation | `TokenService` |
| `users` | `users`, `user_behavior` | Profile, KYC (cached, circuit breaker), risk tier, hold limits | `UsersFacade` |
| `catalog` | `jameyas`, `seats`, `featured_campaigns` | Marketplace snapshot, ranking, seat map, seat claims, Redis gate | `CatalogFacade` |
| `reservations` | `reservations` | Lifecycle, eligibility checks, reserve / checkout / cancel, hold sweeper | `ReservationsFacade` |
| `payments` | `payments`, `payment_events`, `ledger_entries`, `payment_outbox` | Provider port and simulator, webhooks, ledger, outbox, reconciliation | `PaymentsFacade` |
| `idempotency` | `idempotency_keys` | `Idempotency-Key` handling | `IdempotencyInterceptor` |
| `analytics` | `analytics_events` | A/B assignment, event ingestion | `AnalyticsFacade` |
| `audit` | `audit_log` (append-only) | Audit trail inside business transactions | `AuditFacade` |
| `account` | none | `GET /me`, combining users and reservations without a cycle | – |
| `health` | none | `GET /health` | – |

`shared/` holds cross-cutting code: config, database, Redis, errors, logging, rate limiter, circuit breakers, two-tier cache, conditional GET, and the job runner.
