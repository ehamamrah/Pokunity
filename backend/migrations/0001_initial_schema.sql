-- Pokunity initial schema.
-- Tables are grouped by owning module. Cross-module references are plain UUID columns
-- (no cross-module foreign keys) so that a module can later be extracted with its data.
-- Invariants that protect money and seats are enforced HERE, not only in application code.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared guard functions
-- ---------------------------------------------------------------------------

-- Append-only tables (audit_log, ledger_entries) reject UPDATE / DELETE / TRUNCATE.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- Generic state-machine guard: allowed transitions are passed as 'FROM>TO' trigger args.
CREATE OR REPLACE FUNCTION guard_status_transition() RETURNS trigger AS $$
BEGIN
  IF OLD.status = NEW.status OR (OLD.status || '>' || NEW.status) = ANY (TG_ARGV) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'illegal % status transition % -> %', TG_TABLE_NAME, OLD.status, NEW.status
    USING ERRCODE = 'P0002';
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users module
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  text NOT NULL UNIQUE,
  name                   text NOT NULL,
  password_hash          text NOT NULL,
  risk_tier              text NOT NULL CHECK (risk_tier IN ('LOW', 'MEDIUM', 'HIGH')),
  typical_monthly_amount bigint CHECK (typical_monthly_amount >= 0),
  preferred_durations    int[] NOT NULL DEFAULT '{}',
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Behavioral signals used for hold limits and personalization.
CREATE TABLE user_behavior (
  user_id                 uuid PRIMARY KEY REFERENCES users (id),
  expired_holds_count     int NOT NULL DEFAULT 0 CHECK (expired_holds_count >= 0),
  confirmed_count         int NOT NULL DEFAULT 0 CHECK (confirmed_count >= 0),
  confirmed_monthly_total bigint NOT NULL DEFAULT 0,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Data of the *simulated* external KYC provider (would not exist with a real provider).
CREATE TABLE kyc_simulator_profiles (
  user_id  uuid PRIMARY KEY REFERENCES users (id),
  status   text NOT NULL CHECK (status IN ('VERIFIED', 'PENDING', 'REJECTED')),
  behavior text NOT NULL DEFAULT 'NORMAL' CHECK (behavior IN ('NORMAL', 'TIMEOUT'))
);

-- ---------------------------------------------------------------------------
-- catalog module
-- ---------------------------------------------------------------------------
CREATE TABLE jameyas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  name            text NOT NULL,
  monthly_amount  bigint NOT NULL CHECK (monthly_amount > 0),
  currency        char(3) NOT NULL DEFAULT 'SAR' CHECK (currency = 'SAR'),
  duration_months int NOT NULL CHECK (duration_months BETWEEN 2 AND 36),
  start_date      date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE seats (
  jameya_id      uuid NOT NULL REFERENCES jameyas (id),
  seat_number    int NOT NULL CHECK (seat_number >= 1),
  fee            bigint NOT NULL CHECK (fee >= 0),
  status         text NOT NULL CHECK (status IN ('AVAILABLE', 'HELD', 'TAKEN')),
  reservation_id uuid,
  holder_user_id uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Invariant: one row per (jameya, seat) => a seat physically cannot be double booked.
  PRIMARY KEY (jameya_id, seat_number),
  CONSTRAINT seat_available_has_no_holder
    CHECK (status <> 'AVAILABLE' OR (reservation_id IS NULL AND holder_user_id IS NULL)),
  CONSTRAINT seat_held_has_reservation
    CHECK (status <> 'HELD' OR (reservation_id IS NOT NULL AND holder_user_id IS NOT NULL))
);
-- A reservation can own at most one seat.
CREATE UNIQUE INDEX seats_reservation_uq ON seats (reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX seats_available_idx ON seats (jameya_id) WHERE status = 'AVAILABLE';
CREATE TRIGGER seats_status_guard BEFORE UPDATE OF status ON seats
  FOR EACH ROW EXECUTE FUNCTION guard_status_transition('AVAILABLE>HELD', 'HELD>AVAILABLE', 'HELD>TAKEN');

-- Marketing configuration: featured placement campaigns.
CREATE TABLE featured_campaigns (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jameya_id uuid NOT NULL REFERENCES jameyas (id),
  campaign  text NOT NULL,
  priority  int NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  CHECK (ends_at > starts_at),
  UNIQUE (campaign, jameya_id)
);
CREATE INDEX featured_campaigns_window_idx ON featured_campaigns (starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- reservations module
-- ---------------------------------------------------------------------------
CREATE TABLE reservations (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL,
  jameya_id      uuid NOT NULL,
  jameya_name    text NOT NULL,
  seat_number    int NOT NULL,
  fee            bigint NOT NULL CHECK (fee >= 0),       -- locked at hold time
  monthly_amount bigint NOT NULL CHECK (monthly_amount > 0),
  currency       char(3) NOT NULL DEFAULT 'SAR',
  status         text NOT NULL CHECK (status IN
                   ('HELD', 'PAYMENT_PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'FAILED')),
  failure_reason text CHECK (failure_reason IN
                   ('PAYMENT_DECLINED', 'PAYMENT_TIMEOUT', 'HOLD_EXPIRED', 'SEAT_CONFLICT')),
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('FAILED', 'EXPIRED') OR failure_reason IS NOT NULL)
);
-- Invariant: at most one active (HELD / PAYMENT_PENDING) reservation per user per Jameya.
CREATE UNIQUE INDEX reservations_active_user_jameya_uq ON reservations (user_id, jameya_id)
  WHERE status IN ('HELD', 'PAYMENT_PENDING');
-- Invariant: at most one live (active or confirmed) reservation per seat.
CREATE UNIQUE INDEX reservations_live_seat_uq ON reservations (jameya_id, seat_number)
  WHERE status IN ('HELD', 'PAYMENT_PENDING', 'CONFIRMED');
CREATE INDEX reservations_held_expiry_idx ON reservations (expires_at) WHERE status = 'HELD';
CREATE INDEX reservations_user_created_idx ON reservations (user_id, created_at DESC);
CREATE TRIGGER reservations_status_guard BEFORE UPDATE OF status ON reservations
  FOR EACH ROW EXECUTE FUNCTION guard_status_transition(
    'HELD>PAYMENT_PENDING', 'HELD>EXPIRED', 'HELD>CANCELLED', 'HELD>CONFIRMED',
    'PAYMENT_PENDING>CONFIRMED', 'PAYMENT_PENDING>FAILED');

-- ---------------------------------------------------------------------------
-- payments module
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id                   uuid PRIMARY KEY,
  reservation_id       uuid NOT NULL UNIQUE,   -- one payment per reservation, ever
  user_id              uuid NOT NULL,
  amount               bigint NOT NULL CHECK (amount > 0),
  currency             char(3) NOT NULL DEFAULT 'SAR',
  status               text NOT NULL CHECK (status IN
                         ('AUTHORIZING', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'FAILED')),
  payment_method_token text NOT NULL,
  provider_intent_id   text UNIQUE,
  failure_code         text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_authorizing_idx ON payments (created_at) WHERE status = 'AUTHORIZING';
CREATE TRIGGER payments_status_guard BEFORE UPDATE OF status ON payments
  FOR EACH ROW EXECUTE FUNCTION guard_status_transition(
    'AUTHORIZING>AUTHORIZED', 'AUTHORIZING>FAILED', 'AUTHORIZED>CAPTURED', 'AUTHORIZED>VOIDED',
    'FAILED>VOIDED');

-- Every provider callback, keyed by provider event id => duplicates are no-ops.
CREATE TABLE payment_events (
  event_id          text PRIMARY KEY,
  type              text NOT NULL,
  payment_intent_id text NOT NULL,
  payload           jsonb NOT NULL,
  outcome           text NOT NULL DEFAULT 'RECEIVED' CHECK (outcome IN
                      ('RECEIVED', 'PROCESSED', 'IGNORED', 'ORPHAN', 'ORPHAN_RESOLVED')),
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz
);
CREATE INDEX payment_events_orphan_idx ON payment_events (received_at) WHERE outcome = 'ORPHAN';

-- Append-only money ledger. One entry per (payment, kind) => no double capture is recordable.
CREATE TABLE ledger_entries (
  id         bigserial PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES payments (id),
  entry_type text NOT NULL CHECK (entry_type IN ('AUTHORIZE', 'CAPTURE', 'VOID')),
  amount     bigint NOT NULL CHECK (amount >= 0),
  currency   char(3) NOT NULL DEFAULT 'SAR',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, entry_type)
);
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Transactional outbox for provider side effects (capture / void).
CREATE TABLE payment_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      uuid NOT NULL REFERENCES payments (id),
  command         text NOT NULL CHECK (command IN ('CAPTURE', 'VOID')),
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'DEAD')),
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);
-- A payment is either captured or voided, never both.
CREATE UNIQUE INDEX payment_outbox_single_settlement_uq ON payment_outbox (payment_id);
CREATE INDEX payment_outbox_due_idx ON payment_outbox (next_attempt_at) WHERE status = 'PENDING';

-- State of the *simulated* payment provider (external system stand-in).
CREATE TABLE simulator_payment_intents (
  id                 text PRIMARY KEY,
  merchant_reference text NOT NULL UNIQUE,
  amount             bigint NOT NULL,
  currency           char(3) NOT NULL,
  token              text NOT NULL,
  status             text NOT NULL CHECK (status IN
                       ('PENDING', 'AUTHORIZED', 'FAILED', 'CAPTURED', 'VOIDED')),
  failure_code       text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- idempotency module
-- ---------------------------------------------------------------------------
CREATE TABLE idempotency_keys (
  user_id         uuid NOT NULL,
  key             uuid NOT NULL,
  request_hash    text NOT NULL,
  status          text NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  response_status int,
  response_body   jsonb,
  locked_until    timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idempotency_keys_expiry_idx ON idempotency_keys (expires_at);

-- ---------------------------------------------------------------------------
-- analytics module
-- ---------------------------------------------------------------------------
CREATE TABLE analytics_events (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL,
  source         text NOT NULL CHECK (source IN ('client', 'server')),
  type           text NOT NULL,
  jameya_id      uuid,
  position       int,
  surface        text,
  experiment_key text,
  variant        text,
  occurred_at    timestamptz NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_experiment_idx ON analytics_events (experiment_key, variant, type);

-- ---------------------------------------------------------------------------
-- audit module
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor       text NOT NULL,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace_id    text
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, occurred_at);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
