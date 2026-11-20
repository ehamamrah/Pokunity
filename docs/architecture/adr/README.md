# Architecture Decision Records

| # | Decision | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith with facades and ports | Accepted |
| [0002](0002-authorize-capture-not-refund.md) | Authorize → confirm → capture; void instead of refund | Accepted |
| [0003](0003-postgres-source-of-truth-redis-as-gate.md) | PostgreSQL is the source of truth; Redis is only a gate/cache | Accepted |
| [0004](0004-transactional-outbox.md) | Transactional outbox for provider side effects | Accepted |
| [0005](0005-hold-ttl-and-sweeper.md) | 5-minute holds, SQL sweeper with advisory lock (`@nestjs/schedule`, not BullMQ) | Accepted |
| [0006](0006-kyc-fail-closed-with-cache-and-breaker.md) | KYC: fail closed, cached, circuit breaker | Accepted |
| [0007](0007-raw-sql-over-orm.md) | `node-postgres` with explicit SQL instead of an ORM | Accepted |
| [0008](0008-in-memory-marketplace-snapshot.md) | In-memory marketplace snapshot (≤ 5 s) for ranking | Accepted |

Format: Context / Decision / Consequences / Alternatives considered.
