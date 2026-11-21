import { randomUUID } from 'node:crypto';

export interface Attempt {
  status: number;
  code: string;
  ms: number;
  reservationId?: string;
}

/** Distinct client IP per member, as a load balancer would forward it (X-Forwarded-For). */
export const clientIp = (i: number) => `10.77.${(i >> 8) & 255}.${i & 255}`;

const headers = (token: string, ip: string) => ({
  Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), 'X-Forwarded-For': ip,
});

/** One reservation attempt; network errors are reported as status 0. */
export async function attempt(baseUrl: string, token: string, jameyaId: string, seatNumber: number, ip = '10.77.0.1'): Promise<Attempt> {
  const started = performance.now();
  try {
    const res = await fetch(`${baseUrl}/api/v1/reservations`, {
      method: 'POST', headers: headers(token, ip), body: JSON.stringify({ jameyaId, seatNumber }),
    });
    const body = (await res.json()) as { id?: string; error?: { code: string } };
    return { status: res.status, code: body.error?.code ?? 'HELD', ms: performance.now() - started, reservationId: body.id };
  } catch (error) {
    return { status: 0, code: `NETWORK:${(error as Error).message}`, ms: performance.now() - started };
  }
}

export async function cancel(baseUrl: string, token: string, reservationId: string): Promise<void> {
  await fetch(`${baseUrl}/api/v1/reservations/${reservationId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}
