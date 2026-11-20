/**
 * Integration-test environment. Inside docker the compose overlay (backend/docker-compose.test.yml)
 * provides every value. For a host run, export DATABASE_URL / REDIS_URL pointing at a database whose
 * name ends in `_test` (see docs/backend/development.md). Defaults below are deliberately fake.
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://pokunity:change-me@localhost:5432/pokunity_test',
  REDIS_URL: 'redis://localhost:6379/1',
  JWT_SECRET: 'test-only-change-me-jwt-secret',
  PAYMENT_WEBHOOK_SECRET: 'test-only-change-me-webhook-secret',
  PAYMENT_WEBHOOK_URL: 'http://localhost:4999/api/v1/payments/webhook',
  HOLD_TTL_SECONDS: '300',
  LOG_LEVEL: 'error',
  // Jobs and simulator callbacks are driven explicitly by the tests (deterministic).
  JOBS_ENABLED: 'false',
  SIMULATOR_AUTO_WEBHOOKS: 'false',
};

export function applyTestEnv(): void {
  Object.entries(defaults).forEach(([key, value]) => {
    process.env[key] ??= value;
  });
  process.env.JOBS_ENABLED = 'false';
  process.env.SIMULATOR_AUTO_WEBHOOKS = 'false';
}

applyTestEnv();
