import { randomUUID } from 'node:crypto';

export interface Attempt {
  status: number;
  code: string;
  ms: number;
  reservationId?: string;
}

/** One reservation attempt; network errors are reported as status 0. */
export async function attempt(baseUrl: string, token: string, jameyaId: string, seatNumber: number): Promise<Attempt> {
  const started = performance.now();
  try {
    const res = await fetch(`${baseUrl}/api/v1/reservations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ jameyaId, seatNumber }),
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
