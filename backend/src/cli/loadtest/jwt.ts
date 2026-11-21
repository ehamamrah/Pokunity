import { createHmac, randomUUID } from 'node:crypto';

const b64url = (value: object | Buffer) =>
  (Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).toString('base64url');

/**
 * Mints HS256 access tokens exactly like the API does. The load test runs next to the API with the
 * same JWT_SECRET, so 1 000 logins (bcrypt + 5/min/IP limit) are not part of what we measure.
 */
export function mintToken(user: { id: string; email: string }, secret: string, ttlSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url({ sub: user.id, email: user.email, jti: randomUUID(), ver: 0, iat: now, exp: now + ttlSeconds });
  const signature = createHmac('sha256', secret).update(`${head}.${body}`).digest();
  return `${head}.${body}.${b64url(signature)}`;
}
