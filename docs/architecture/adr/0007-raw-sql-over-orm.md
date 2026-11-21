# ADR-0007: node-postgres with explicit SQL

**Status:** Accepted

## Context

The correctness of the product rests on a handful of statements: conditional updates, `SKIP
LOCKED` batches, `ON CONFLICT DO NOTHING`, advisory locks, and partial-index-aware inserts.

## Decision

Use `pg` directly. SQL lives as named constants in repositories next to a comment explaining
the guarantee. Repositories map rows to typed domain records. `BIGINT` money is parsed to `number`
(safe: amounts are far below 2^53 halalas).

## Consequences

* Every critical statement is visible in code review and in this documentation.
* There is a little more boilerplate (row mappers). The migration tool is a 40-line runner over
  ordered `.sql` files.

## Alternatives considered

* **Prisma / TypeORM.** Good for CRUD, but conditional updates and locking hints fall back to raw
  SQL anyway, which would hide the important statements among generated ones.
* **Kysely.** A reasonable middle ground; we chose not to add another layer for this scope.
