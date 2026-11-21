# ADR-0010: Write-behind buffer for analytics events

**Status:** Accepted

## Context

`POST /events` receives impression/click batches from every marketplace page view. Inserting
synchronously put a database write on the hot path for data that is not financial and does
not need to be read immediately.

## Decision

- The controller validates and appends events to an in-process **write-behind buffer** and
  returns `202` immediately (zero queries on the request path).
- The buffer flushes as one multi-row insert every **250 ms or 500 events**, whichever comes
  first, and is flushed on graceful shutdown.
- Server-side funnel events (`reservation_created`, `reservation_confirmed`) use the same buffer
  and are best effort too: analytics must never slow down or fail the booking path. The
  authoritative record of bookings and money is the `reservations` table, the append-only
  ledger and the audit log, never analytics.

## Consequences

- `POST /events` throughput +19 % and DB write load reduced to ~4 inserts/s per instance at most.
- A hard kill (SIGKILL / OOM) can lose up to 250 ms of analytics events. Acceptable for
  experiment metrics; documented so analysts know the data is best-effort.

## Alternatives considered

- **BullMQ/Redis stream:** durable, but adds a Redis write per batch and a consumer to operate;
  worth it when events feed billing or compliance, which they don't here.
- **Kafka / managed event pipeline:** the right long-term home for product analytics at scale.
