# ADR-0001: Modular monolith

**Status:** Accepted

## Context
The booking path spans identity (KYC), inventory (seats), reservations, and payments, and its
consistency requirements are strict: a seat and its payment outcome must change together. The
team is small, the domain is still evolving, and a regulator will audit the money flow.

## Decision
Ship one NestJS deployable with modules that have hard boundaries (`auth`, `users`, `catalog`,
`reservations`, `payments`, `idempotency`, `analytics`, `audit`, `account`, `health`). Each module
owns its tables and exposes a facade. Modules join a shared transaction by receiving a
`SqlExecutor` (Unit of Work) instead of touching each other's tables. Where a lower-level module
must call up (payments → reservations), it declares a port that the upper module implements.

## Consequences
* Local ACID transactions across seat, reservation, and payment state: no distributed saga is
  needed for the core invariant.
* One build, one deploy, one log stream; a simple local setup (`docker compose up`).
* Boundaries depend on discipline plus Nest's export rules, so CI tooling (dependency-cruiser) is recommended.
* Extraction path: `payments` is the first candidate (already behind a port and outbox; no
  cross-module foreign keys). Shared transactions would then become outbox events and the
  settlement port an async consumer.

## Alternatives considered
* **Microservices from day one.** This would need sagas or 2PC for seat and payment
  consistency, add a lot of operational overhead, and make the hardest invariant harder to guarantee.
* **Unstructured monolith.** Fast at first, but the money path would become entangled with
  marketplace concerns and hard to audit.
