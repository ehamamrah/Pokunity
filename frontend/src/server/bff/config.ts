/** Name of the httpOnly cookie that carries the JWT. Client JavaScript cannot read it. */
export const SESSION_COOKIE = 'pokunity_session';

const DEFAULT_BACKEND_URL = 'http://localhost:4000';

/**
 * Read per request, never inlined at build time, so one image runs in any environment.
 * This is why the proxy is a route handler and not a next.config rewrite.
 */
export function backendBaseUrl(): string {
  return (process.env.BACKEND_INTERNAL_URL ?? DEFAULT_BACKEND_URL).replace(/\/+$/, '');
}

/** Endpoints the browser must never reach through the BFF. Provider callbacks go straight to the backend. */
const BLOCKED_PATHS = new Set(['payments/webhook']);

/** Endpoints that work without a session. Everything else needs the cookie. */
const ANONYMOUS_PATHS = new Set(['health']);

export function isBlockedPath(segments: readonly string[]): boolean {
  return BLOCKED_PATHS.has(segments.join('/'));
}

export function requiresSession(segments: readonly string[]): boolean {
  return !ANONYMOUS_PATHS.has(segments.join('/'));
}
