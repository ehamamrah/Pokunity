import { SESSION_COOKIE } from './config';

/**
 * Secure is on under HTTPS. COOKIE_SECURE=true|false overrides it, for TLS-terminating proxies.
 * Plain HTTP localhost stays usable in development and in the docker-compose stack.
 */
export function isSecureRequest(url: string, env: Record<string, string | undefined> = process.env): boolean {
  if (env.COOKIE_SECURE === 'true') return true;
  if (env.COOKIE_SECURE === 'false') return false;
  return new URL(url).protocol === 'https:';
}

export interface SessionCookie {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
}

export function sessionCookie(value: string, maxAgeSeconds: number, secure: boolean): SessionCookie {
  return { name: SESSION_COOKIE, value, httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: maxAgeSeconds };
}

/** Expires the cookie with the same attributes it was set with, so the browser actually drops it. */
export function expiredSessionCookie(secure: boolean): SessionCookie {
  return sessionCookie('', 0, secure);
}
