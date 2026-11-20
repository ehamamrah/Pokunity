import { createHmac, timingSafeEqual } from 'node:crypto';

export function signPayload(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/** Constant-time comparison of the hex HMAC-SHA256 of the raw body. */
export function isValidSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signPayload(rawBody, secret), 'hex');
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
