# Design Patterns

A pattern is used only where it removes a real risk or real duplication.

| Pattern | Where | Why |
|---|---|---|
| State machine | Reservation and payment lifecycles, mirrored by database triggers | Few legal moves; every `UPDATE` checks the expected status |
| Strategy | Ranking per A/B variant; one comparator per sort | A new variant is a weight table, not an `if` |
| Factory | Ranking strategy, ranking context, eligibility chain | Assembly lives in one place |
| Port / adapter | KYC and payment providers (simulator or real) | Providers are swappable; domain code never sees HTTP |
| Dependency inversion | Payments declares `ReservationSettlement`; reservations implements it | Payments updates reservations without a module cycle |
| Circuit breaker | KYC, payment provider, Redis | A failing dependency fails fast instead of piling up requests |
| Cache-aside + single-flight | KYC, marketplace snapshot | Concurrent identical lookups share one call; stale data is served on errors |
| Chain of responsibility | Reservation checks: KYC → active hold → limit → risk | Ordered, testable checks |
| Specification | Marketplace filters, idempotency decisions | Small composable predicates |
| Transactional outbox | Capture and void | The decision commits with the seat; delivery retries |
| Idempotent receiver | Webhook `event_id` primary key | Duplicate callbacks do nothing |
| Repository | `*.repository.ts` | All SQL for a table in one class |
| Facade | `*.facade.ts` | Narrow public API per module |
| Unit of work | `Database.transaction()` passed between facades | Several modules share one transaction |
| Interceptor / decorator | `@RateLimit`, `@Public`, idempotency interceptor | Cross-cutting rules declared per route |
| Presenter | Reservation and Jameya presenters | One mapping to the contract's exact shape |
