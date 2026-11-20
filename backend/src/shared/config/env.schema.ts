import { z } from 'zod';

const bool = (fallback: 'true' | 'false') =>
  z.enum(['true', 'false']).default(fallback).transform((v) => v === 'true');

/** Every runtime setting is validated at boot; the process refuses to start on bad config. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().min(2).default(20),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  PAYMENT_WEBHOOK_SECRET: z.string().min(8),
  PAYMENT_WEBHOOK_URL: z.string().url(),
  HOLD_TTL_SECONDS: z.coerce.number().int().min(10).default(300),
  /** Global per-client-IP ceiling (requests per 10 s). Generous: a BFF may front many users. */
  RATE_LIMIT_IP_PER_10S: z.coerce.number().int().positive().default(1000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.string().default('loopback, uniquelocal'),
  KYC_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
  KYC_FRESH_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  KYC_STALE_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  KYC_NEGATIVE_TTL_SECONDS: z.coerce.number().int().positive().default(15),
  KYC_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
  KYC_BREAKER_OPEN_MS: z.coerce.number().int().positive().default(15000),
  PAYMENT_RECONCILE_AFTER_SECONDS: z.coerce.number().int().positive().default(120),
  PAYMENT_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(600),
  SIMULATOR_AUTO_WEBHOOKS: bool('true'),
  JOBS_ENABLED: bool('true'),
  SEED_JAMEYAS: z.coerce.number().int().min(0).default(5000),
  SEED_LOADTEST_USERS: z.coerce.number().int().min(0).default(1000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n  ${issues.join('\n  ')}`);
  }
  return parsed.data;
}
