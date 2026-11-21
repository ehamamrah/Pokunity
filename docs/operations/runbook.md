# Runbook

Start, stop and seed: [README](../../README.md#how-to-run).

## Health

`GET /api/v1/health` returns `503` only if PostgreSQL or Redis is down. `kyc: degraded` means the KYC breaker is open: booking needs a cached verification, browsing is unaffected.

## Try it with curl

```bash
B=http://localhost:4000/api/v1
T=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"sara@pokunity.app","password":"Pokunity123!"}' | jq -r .accessToken)
J=$(curl -s $B/jameyas/featured -H "Authorization: Bearer $T" | jq -r '.data[0].id')
curl -s $B/jameyas/$J -H "Authorization: Bearer $T" | jq '[.seats[]|select(.status=="AVAILABLE")|.seatNumber]'
R=$(curl -s -X POST $B/reservations -H "Authorization: Bearer $T" -H "Idempotency-Key: $(uuidgen)" \
     -H 'Content-Type: application/json' -d "{\"jameyaId\":\"$J\",\"seatNumber\":<seat>}" | jq -r .id)
curl -s -X POST $B/reservations/$R/checkout -H "Authorization: Bearer $T" -H "Idempotency-Key: $(uuidgen)" \
     -H 'Content-Type: application/json' -d '{"paymentMethodToken":"tok_success"}'
curl -s $B/reservations/$R -H "Authorization: Bearer $T" | jq '{status, payment}'   # CONFIRMED / CAPTURED
```

Login is limited to 5 per minute per IP.

## Logs and alerts

Logs are JSON on stdout, one line per request with `requestId`. The same id is returned as `error.traceId`, so you can search for it.

| Alert | Query | Fire when |
|---|---|---|
| Outbox dead letters | `SELECT count(*) FROM payment_outbox WHERE status='DEAD'` | > 0 |
| Outbox backlog | `... WHERE status='PENDING' AND next_attempt_at < now() - interval '1 min'` | > 50 |
| Stuck payments | `SELECT count(*) FROM payments WHERE status='AUTHORIZING' AND created_at < now() - interval '15 min'` | > 0 |
| Old orphan events | `SELECT count(*) FROM payment_events WHERE outcome='ORPHAN' AND received_at < now() - interval '1 hour'` | > 0 |
| KYC breaker | `/health` shows `kyc: degraded` | > 5 min |

## Incidents

| Symptom | Cause | Action |
|---|---|---|
| Outbox row `DEAD` | Capture or void keeps failing | Read `last_error`, fix the cause, then re-arm (below). Capture before the authorization expires (usually 7 days) |
| Payments stuck `AUTHORIZING` | Reconciliation not running | Check `payment reconciled` logs and `SELECT * FROM pg_locks WHERE locktype='advisory'` |
| `kyc: degraded` | KYC vendor down | Escalate to the vendor. **Never** switch KYC to fail open |
| Redis down | – | Booking still works on PostgreSQL alone; restore Redis; counters rebuild within 10 s |
| `JAMEYA_FULL` but seats are free | Gate counter drifted | Self-heals in 10 s, or `redis-cli DEL gate:avail:<jameyaId>` |
| "My change doesn't show" | Lists may be 5 s old by design | Check `X-As-Of`; force a rebuild with `redis-cli DEL mkt:snapshot:v3` |
| Captured with no seat (should be impossible) | – | Run the first reconciliation query, stop jobs (`JOBS_ENABLED=false`), trace in `audit_log`, refund via the provider, post-mortem |
| Compromised account | – | Revoke all sessions (below), force a password reset, review `audit_log` |

```sql
-- Re-arm a dead outbox command
UPDATE payment_outbox SET status='PENDING', attempts=0, next_attempt_at=now() WHERE id = '<id>';

-- Revoke every session of a member (immediate here, within 5 s on other instances)
UPDATE users SET token_version = token_version + 1 WHERE email = '<email>' RETURNING id;
```

To revoke a single token: `redis-cli SET auth:revoked:<jti> 1 EX <seconds until expiry>`. A manual revocation is not audited, so record it in the incident log.

## Reconciliation queries

Each should return 0 rows.

```sql
-- Captured, but the reservation or seat isn't confirmed
SELECT p.id FROM payments p
JOIN ledger_entries l ON l.payment_id = p.id AND l.entry_type = 'CAPTURE'
LEFT JOIN reservations r ON r.id = p.reservation_id
LEFT JOIN seats s ON s.reservation_id = p.reservation_id
WHERE r.status IS DISTINCT FROM 'CONFIRMED' OR s.status IS DISTINCT FROM 'TAKEN';

-- Held seat without a live reservation
SELECT s.* FROM seats s LEFT JOIN reservations r ON r.id = s.reservation_id
WHERE s.status = 'HELD' AND (r.id IS NULL OR r.status NOT IN ('HELD','PAYMENT_PENDING'));

-- Confirmed and paid, but not captured after 5 minutes
SELECT r.id FROM reservations r JOIN payments p ON p.reservation_id = r.id
WHERE r.status = 'CONFIRMED' AND p.status <> 'CAPTURED' AND r.updated_at < now() - interval '5 min';

-- Ledger rows in an unexpected order
SELECT payment_id, string_agg(entry_type, ',' ORDER BY id) FROM ledger_entries GROUP BY 1
HAVING string_agg(entry_type, ',' ORDER BY id) NOT IN ('AUTHORIZE,CAPTURE','AUTHORIZE,VOID','AUTHORIZE');
```

## Scaling

- API replicas are stateless, and jobs are safe to run on several instances (advisory locks). To split jobs out, run the same image with `JOBS_ENABLED=false` on API replicas and `true` on one worker.
- Keep `replicas × DB_POOL_MAX` below PostgreSQL `max_connections`, or add PgBouncer.
