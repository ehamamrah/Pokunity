-- Performance & resilience pass (see docs/performance/backend.md).

-- ---------------------------------------------------------------------------
-- payments: provider authorization goes through the transactional outbox too.
-- ---------------------------------------------------------------------------
ALTER TABLE payment_outbox DROP CONSTRAINT payment_outbox_command_check;
ALTER TABLE payment_outbox ADD CONSTRAINT payment_outbox_command_check
  CHECK (command IN ('AUTHORIZE', 'CAPTURE', 'VOID'));
DROP INDEX payment_outbox_single_settlement_uq;
-- Each command at most once per payment...
CREATE UNIQUE INDEX payment_outbox_payment_command_uq ON payment_outbox (payment_id, command);
-- ...and a payment is settled (captured OR voided) at most once.
CREATE UNIQUE INDEX payment_outbox_single_settlement_uq ON payment_outbox (payment_id)
  WHERE command IN ('CAPTURE', 'VOID');

-- ---------------------------------------------------------------------------
-- catalog: static per-Jameya aggregates, so the marketplace snapshot never aggregates fees.
-- Seat *availability* is deliberately NOT denormalised onto jameyas: that would make every seat
-- claim lock the Jameya row (a hot row under contention). It is counted with an index-only scan.
-- ---------------------------------------------------------------------------
ALTER TABLE jameyas
  ADD COLUMN total_seats int NOT NULL DEFAULT 0,
  ADD COLUMN min_fee bigint NOT NULL DEFAULT 0,
  ADD COLUMN max_fee bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION refresh_jameya_seat_aggregates() RETURNS trigger AS $$
BEGIN
  UPDATE jameyas j SET total_seats = a.total, min_fee = a.min_fee, max_fee = a.max_fee
  FROM (SELECT s.jameya_id, count(*)::int AS total, min(s.fee) AS min_fee, max(s.fee) AS max_fee
        FROM seats s WHERE s.jameya_id IN (SELECT DISTINCT jameya_id FROM changed)
        GROUP BY s.jameya_id) a
  WHERE j.id = a.jameya_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Statement-level: one recomputation per INSERT statement (the seed inserts 69k seats at once).
CREATE TRIGGER seats_aggregates_on_insert AFTER INSERT ON seats
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION refresh_jameya_seat_aggregates();
-- A (rare) fee change keeps min/max consistent. Row-level and guarded by WHEN, so status changes
-- (the booking hot path) never fire it and never touch the jameyas row.
CREATE OR REPLACE FUNCTION refresh_jameya_fee_range() RETURNS trigger AS $$
BEGIN
  UPDATE jameyas j SET min_fee = a.min_fee, max_fee = a.max_fee
  FROM (SELECT min(fee) AS min_fee, max(fee) AS max_fee FROM seats WHERE jameya_id = NEW.jameya_id) a
  WHERE j.id = NEW.jameya_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seats_fee_range_on_update AFTER UPDATE OF fee ON seats
  FOR EACH ROW WHEN (OLD.fee IS DISTINCT FROM NEW.fee) EXECUTE FUNCTION refresh_jameya_fee_range();

-- Backfill existing data.
UPDATE jameyas j SET total_seats = a.total, min_fee = a.min_fee, max_fee = a.max_fee
FROM (SELECT jameya_id, count(*)::int AS total, min(fee) AS min_fee, max(fee) AS max_fee
      FROM seats GROUP BY jameya_id) a
WHERE j.id = a.jameya_id;

-- ---------------------------------------------------------------------------
-- reservations: index-only answer for "active holds of this member" (booking path + /me).
-- ---------------------------------------------------------------------------
CREATE INDEX reservations_active_by_user_idx ON reservations (user_id) INCLUDE (jameya_id, id)
  WHERE status IN ('HELD', 'PAYMENT_PENDING');
