# Backend Runbook

## Start / stop

```bash
cp .env.example .env                                   # once
docker compose up -d --build postgres redis backend    # API on :4000
docker compose ps                                      # backend must become "healthy"
docker compose down                                    # keep data volume
docker compose down -v                                 # wipe data (re-seeded on next start)
```

Health: `GET /api/v1/health` → `200 {status: ok, checks: {database, redis, kyc}}`. It returns `503`
only if the database or Redis is down. `kyc: degraded` means the KYC circuit breaker is open
(booking for members without a cached verification returns `503 KYC_UNAVAILABLE`; browsing is unaffected).

## Manual walkthrough

```bash
B=http://localhost:4000/api/v1
T=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"sara@pokunity.app","password":"Pokunity123!"}' | jq -r .accessToken)
curl -s "$B/jameyas?pageSize=3" -H "Authorization: Bearer $T" | jq '.meta, .data[].name'
J=$(curl -s $B/jameyas/featured -H "Authorization: Bearer $T" | jq -r '.data[0].id')
curl -s $B/jameyas/$J -H "Authorization: Bearer $T" | jq '.viewer, [.seats[]|select(.status=="AVAILABLE")]'
R=$(curl -s -X POST $B/reservations -H "Authorization: Bearer $T" -H "Idempotency-Key: $(uuidgen)" \
     -H 'Content-Type: application/json' -d "{\"jameyaId\":\"$J\",\"seatNumber\":<seat>}" | jq -r .id)
curl -s -X POST $B/reservations/$R/checkout -H "Authorization: Bearer $T" -H "Idempotency-Key: $(uuidgen)" \
     -H 'Content-Type: application/json' -d '{"paymentMethodToken":"tok_success"}'
curl -s $B/reservations/$R -H "Authorization: Bearer $T" | jq '{status, payment}'   # → CONFIRMED / CAPTURED
```

Demo users (password `Pokunity123!`): `sara` (happy path), `omar` (`KYC_REQUIRED`), `lina`
(HIGH risk; earliest 30% of seats → `RISK_RESTRICTED`), `khaled` (hold limit 1), `noura` (KYC
times out → `kycStatus: UNKNOWN`, `503 KYC_UNAVAILABLE`). Tokens: `tok_success`, `tok_decline`,
`tok_slow` (about 8 s), `tok_duplicate` (3 identical callbacks), `tok_timeout` (no callback;
reconciliation confirms after about 2 min). Login is limited to 5/min/IP.

## Observability

* **Logs:** JSON lines on stdout. Every HTTP request logs `method, path, status, durationMs,
  requestId`. Clients may send `X-Request-Id`; it is echoed and returned as `error.traceId`. Search
  by that id to follow one request through jobs and webhooks.
* **Key log messages:** `provider event` (type, outcome: PROCESSED/IGNORED/ORPHAN/DUPLICATE),
  `payment reconciled` (verdict), `outbox command failed`, `expired holds`, `kyc lookup failed`,
  `gate unavailable, admitting`, `rate limiter unavailable, failing open`, `unhandled error`.
* **Recommended metrics/alerts** (to wire into Prometheus/OpenTelemetry):

| Signal | Query / source | Alert |
|---|---|---|
| Outbox dead letters | `SELECT count(*) FROM payment_outbox WHERE status='DEAD'` | > 0 (page) |
| Outbox backlog | `… WHERE status='PENDING' AND next_attempt_at < now() - interval '1 min'` | > 50 |
| Stuck payments | `SELECT count(*) FROM payments WHERE status='AUTHORIZING' AND created_at < now() - interval '15 min'` | > 0 |
| Orphan events | `SELECT count(*) FROM payment_events WHERE outcome='ORPHAN' AND received_at < now() - interval '1 hour'` | > 0 |
| KYC breaker | `/health` `checks.kyc = degraded` | > 5 min |
| 5xx rate, p99 latency | access logs | SLO burn |

## Incidents

### A. Payment captured but no seat (should be impossible)
*Detect:* ledger has `CAPTURE` but the reservation is not `CONFIRMED` or the seat is not `TAKEN`:
```sql
SELECT p.id, p.reservation_id, r.status AS reservation, s.status AS seat
FROM payments p JOIN ledger_entries l ON l.payment_id = p.id AND l.entry_type = 'CAPTURE'
LEFT JOIN reservations r ON r.id = p.reservation_id
LEFT JOIN seats s ON s.reservation_id = p.reservation_id
WHERE r.status IS DISTINCT FROM 'CONFIRMED' OR s.status IS DISTINCT FROM 'TAKEN';
```
*Why it should not happen:* capture is only enqueued in the same transaction that confirmed the seat,
and triggers forbid leaving `CONFIRMED`/`TAKEN`.
*Respond:* (1) freeze: stop the worker (`JOBS_ENABLED=false`) if more rows appear; (2) find the
timeline with `SELECT * FROM audit_log WHERE entity_id IN (<reservation>, <payment>) ORDER BY id` and
the `payment_events` for the intent; (3) if a seat is free, allocate it manually with ops approval;
otherwise refund through the provider console and record it as a compensating ledger entry in a
follow-up migration (the ledger is append-only); (4) notify the member; (5) post-mortem.

### B. Outbox `DEAD` (capture or void keeps failing)
Check `last_error`. Fix the cause (credentials, provider outage), then re-arm:
```sql
UPDATE payment_outbox SET status='PENDING', attempts=0, next_attempt_at=now() WHERE id = '<id>';
```
For a CAPTURE: the seat is already confirmed and funds are authorized; capture before the
authorization expires (provider-specific, usually 7 days).

### C. Payments stuck in `AUTHORIZING`
Reconciliation resolves them after 2 min (provider lookup) or fails and voids them after 10 min. If they
persist, check the reconciliation logs (`payment reconciled`) and the advisory lock holder:
`SELECT * FROM pg_locks WHERE locktype='advisory';`.

### D. KYC vendor outage
`/health` shows `kyc: degraded`. Members with a verification cached in the last 24 h keep booking.
No action beyond vendor escalation. Do **not** switch to fail-open (regulatory).

### E. Redis outage
Booking keeps working (gate and rate limiter fail open; PostgreSQL decides). Expect higher DB load
under contention, and login/reservation rate limits are not enforced. Restore Redis; counters
rebuild within 10 s and the KYC cache warms on demand.

### F0. Caching questions ("my change does not show")
Marketplace lists are ≤ 5 s stale by design; `X-As-Of` shows when the server last verified them.
ETags change only when visible content changes ([caching.md](../performance/caching.md)). To force a
snapshot rebuild: `redis-cli DEL mkt:snapshot:v3` (instances also drop their 1 s L1 copy on expiry).

### F. Seats appear unavailable but are free (`JAMEYA_FULL` while the list shows seats)
The gate counter drifted. It self-corrects within 10 s. To force it: `redis-cli DEL gate:avail:<jameyaId>`.

### G. Compromised member account: revoke all sessions
Revocation must work even if the member cannot log in (stolen credentials).
1. Revoke every token of the member (effective immediately on this instance, ≤ 5 s on others):
   ```sql
   UPDATE users SET token_version = token_version + 1 WHERE email = 'member@example.com' RETURNING id, token_version;
   ```
   (Equivalent to the member calling `POST /auth/logout {"allSessions": true}`.)
2. Force a password reset through the identity process (out of scope of this API) so that the attacker
   cannot simply log in again.
3. Review what the tokens did: `SELECT * FROM audit_log WHERE actor = '<user id>' ORDER BY id DESC LIMIT 100;`
   and the access logs by `requestId`. Check reservations and payments created in the window.
4. Record the action in the incident log. Logouts are audited as `auth.logout.session` /
   `auth.logout.all_sessions`; a manual SQL revocation is not, so note it explicitly.

To revoke a single known token instead: `redis-cli SET auth:revoked:<jti> 1 EX <seconds until exp>`.
If Redis is down, revoked-token checks cannot run: reads continue, reserve/checkout answer
`503 SERVICE_UNAVAILABLE` until Redis returns (fail closed), and logouts escalate to all sessions.

## Reconciliation queries
```sql
-- Seat/reservation agreement (expect 0 rows)
SELECT s.* FROM seats s LEFT JOIN reservations r ON r.id = s.reservation_id
WHERE s.status = 'HELD' AND (r.id IS NULL OR r.status NOT IN ('HELD','PAYMENT_PENDING'));
-- Confirmed paid reservations without capture after 5 minutes (expect 0 rows)
SELECT r.id FROM reservations r JOIN payments p ON p.reservation_id = r.id
WHERE r.status = 'CONFIRMED' AND p.status <> 'CAPTURED' AND r.updated_at < now() - interval '5 min';
-- Ledger shape per payment (expect only AUTHORIZE,CAPTURE / AUTHORIZE,VOID / none)
SELECT payment_id, string_agg(entry_type, ',' ORDER BY id) FROM ledger_entries GROUP BY 1
HAVING string_agg(entry_type, ',' ORDER BY id) NOT IN ('AUTHORIZE,CAPTURE','AUTHORIZE,VOID','AUTHORIZE');
```

## Scaling notes
* API replicas are stateless; jobs are cluster-safe (advisory locks / SKIP LOCKED). To split jobs
  into a worker: run the same image with `JOBS_ENABLED=false` for API replicas and `true` for one worker.
* Keep `replicas × DB_POOL_MAX` below PostgreSQL `max_connections` (or add PgBouncer, transaction mode).
