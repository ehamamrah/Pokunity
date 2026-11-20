import { RateLimitDecision } from './rate-limit.service';

/**
 * Per-instance fixed-window fallback used only while Redis is unavailable. Limits are then enforced
 * per instance (N instances ⇒ up to N× the limit), which is far better than no limit at all.
 */
export class LocalRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitDecision {
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.evictIfLarge(now);
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return decision(window.count <= limit, limit, window.count, window.resetAt - now);
  }

  private evictIfLarge(now: number): void {
    if (this.windows.size < 50_000) return;
    for (const [key, w] of this.windows) if (w.resetAt <= now) this.windows.delete(key);
  }
}

export function decision(allowed: boolean, limit: number, used: number, resetMs: number): RateLimitDecision {
  return { allowed, limit, remaining: Math.max(0, limit - used), resetSeconds: Math.max(1, Math.ceil(resetMs / 1000)) };
}
