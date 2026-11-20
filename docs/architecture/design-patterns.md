# Design Patterns

Each pattern is listed with where it is used and the problem it solves. We use patterns only
where they remove a real risk or real duplication.

| Pattern | Where (backend/src/…) | Why |
|---|---|---|
| **State machine** | `modules/reservations/domain/reservation-state-machine.ts`, `modules/payments/domain/payment-state-machine.ts`; mirrored by `guard_status_transition` triggers in `migrations/0001_initial_schema.sql` | Money and seat lifecycles have few legal moves. Transitions are data, so every `UPDATE` is built as `WHERE status = ANY(<legal sources>)`, and the database rejects anything else even if code is wrong. |
| **Strategy** | `catalog/domain/ranking/weighted-ranking.strategy.ts` + `ranking-strategies.ts` (one strategy per A/B variant); `catalog/domain/sort-strategies.ts` (one comparator per `sort`) | Experiments swap ranking models without `if (variant)` branches. Adding a variant means adding a weight table. |
| **Factory** | `rankingStrategyFor(variant)`, `RankingContextFactory` (assembles the per-viewer context), `buildReservationChain()` | One place decides how objects are assembled; callers stay simple. |
| **Adapter / Port (hexagonal)** | `users/kyc-provider.port.ts` ← `KycSimulatorAdapter`; `payments/payment-gateway.port.ts` ← `PaymentSimulatorAdapter` | Simulators and real vendors are interchangeable. Domain code never sees HTTP details of a provider. |
| **Dependency Inversion (port owned by the caller)** | `payments/settlement.port.ts` implemented by `reservations/application/reservation-settlement.service.ts` | Payments drives reservation outcomes inside its own transaction without a module cycle. |
| **Circuit Breaker** | `users/domain/circuit-breaker.ts`, used by `KycService` | A slow or failing KYC vendor must not exhaust our resources. After 5 consecutive failures, calls fail fast for 15 s, then a single half-open probe decides. |
| **Cache-aside + stale-if-error + single-flight** | `users/application/kyc.service.ts`, `users/infrastructure/kyc-cache.ts`; `catalog/application/catalog-snapshot.service.ts` | KYC answers are fresh for 10 min and served stale for up to 24 h on provider errors. Concurrent identical lookups share one call. |
| **Chain of Responsibility** | `reservations/domain/preconditions/` (KYC → active reservation → hold limit → risk tier) | Contract-ordered, independently testable checks; the limits sub-chain is re-run inside the transaction under a lock. |
| **Specification** | `catalog/domain/listing-filter.ts`; `idempotency/domain/idempotency-record.ts` (`decideExisting`) | Each filter or decision rule is a small predicate, composed by conjunction. |
| **Transactional Outbox** | `payments/infrastructure/outbox.repository.ts`, `payments/application/outbox-processor.job.ts` | The capture/void decision commits atomically with the seat state. A relay with leases, `SKIP LOCKED`, and exponential backoff delivers it at least once (provider calls are idempotent). |
| **Repository** | every `*/infrastructure/*.repository.ts` | All SQL for a table lives in one class owned by one module; application code speaks in domain records. |
| **Facade** | `*.facade.ts` per module | Narrow public API per module; the rest is private. |
| **Unit of Work (explicit)** | `Database.transaction()` + `SqlExecutor` parameters on facade methods | Several modules take part in one transaction while each keeps its own SQL. |
| **Idempotent Receiver** | `payment_events` primary key + `ON CONFLICT DO NOTHING` (`payments/application/webhook.service.ts`) | Duplicate provider callbacks have no side effects. |
| **Interceptor / Decorator** | `IdempotencyInterceptor`, `@RateLimit` + `RateLimitGuard`, `@Public` | Cross-cutting HTTP policies are declared per route, not hand-coded in handlers. |
| **Observer (registration)** | `PaymentsFacade.registerSettlement` called from `ReservationSettlementService.onModuleInit` | Wires the inversion above at boot. |
| **Presenter / Mapper** | `reservation.presenter.ts`, `catalog/application/summary.presenter.ts` | One mapping from records to the exact contract shape. |
