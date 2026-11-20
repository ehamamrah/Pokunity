import { Env } from './env.schema';

/** Typed, immutable view over validated environment configuration (injectable). */
export class AppConfig {
  constructor(readonly env: Readonly<Env>) {}

  get corsOrigins(): string[] {
    return this.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  }
}
