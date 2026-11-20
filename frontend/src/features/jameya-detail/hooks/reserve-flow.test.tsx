import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { db } from '@/mocks/db';
import { JAMEYA_DEFS } from '@/mocks/fixtures';
import { renderWithClient } from '@/test/render';
import { routerState } from '@/test/navigation-mock';
import { JameyaDetailView } from '../components/JameyaDetailView';

const JAMEYA_ID = JAMEYA_DEFS[0]?.id ?? '';
const RESERVATIONS_URL = 'http://localhost:3000/api/v1/reservations';

function recordKey(request: Request): void {
  db.requests.push({ method: 'POST', path: '/api/v1/reservations', idempotencyKey: request.headers.get('idempotency-key'), body: null });
}

function reservationBody() {
  const now = new Date().toISOString();
  return {
    id: 'd1000000-0000-4000-8000-000000000001', jameyaId: JAMEYA_ID, jameyaName: 'Riyadh Savers 12M', seatNumber: 2,
    fee: 0, monthlyAmount: 100000, currency: 'SAR', status: 'HELD', expiresAt: new Date(Date.now() + 300_000).toISOString(),
    failureReason: null, payment: null, createdAt: now, updatedAt: now,
  };
}

function seatConflictBody(seatNumber: number) {
  return { error: { code: 'SEAT_UNAVAILABLE', message: 'x', details: { seatNumber }, traceId: 't' } };
}

function requestKeys(): Array<string | null> {
  return db.requests.filter((entry) => entry.path.endsWith('/reservations') && entry.method === 'POST').map((entry) => entry.idempotencyKey);
}

async function chooseSeat(seatNumber: number): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('radio', { name: new RegExp(`Seat ${seatNumber},`) }));
  await user.click(screen.getByRole('button', { name: new RegExp(`Hold seat ${seatNumber}`) }));
}

function rateLimitThenCreate(): void {
  let calls = 0;
  server.use(
    http.post(RESERVATIONS_URL, ({ request }) => {
      calls += 1;
      recordKey(request);
      if (calls === 1) return HttpResponse.json({ error: { code: 'RATE_LIMITED', message: '', traceId: 't' } }, { status: 429, headers: { 'Retry-After': '0' } });
      return HttpResponse.json(reservationBody(), { status: 201 });
    }),
  );
}

function slowSeatConflict(): void {
  server.use(
    http.post(RESERVATIONS_URL, async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return HttpResponse.json(seatConflictBody(2), { status: 409 });
    }),
  );
}

it('reuses one Idempotency-Key across an automatic retry of the same intent', async () => {
  rateLimitThenCreate();
  renderWithClient(<JameyaDetailView jameyaId={JAMEYA_ID} />);
  await chooseSeat(2);
  await waitFor(() => expect(routerState.push).toHaveBeenCalled());
  const keys = requestKeys();
  expect(keys.length).toBeGreaterThanOrEqual(2);
  expect(new Set(keys).size).toBe(1);
});

it('issues a new key when the user selects a different seat', async () => {
  server.use(
    http.post(RESERVATIONS_URL, ({ request }) => {
      recordKey(request);
      return HttpResponse.json(seatConflictBody(2), { status: 409 });
    }),
  );
  renderWithClient(<JameyaDetailView jameyaId={JAMEYA_ID} />);
  await chooseSeat(2);
  await screen.findByText('That seat was just taken');
  await chooseSeat(4);
  await waitFor(() => expect(requestKeys().length).toBe(2));
  const [first, second] = requestKeys();
  expect(first).not.toBe(second);
});

it('shows the seat as holding optimistically, then rolls back on a 409', async () => {
  slowSeatConflict();
  renderWithClient(<JameyaDetailView jameyaId={JAMEYA_ID} />);
  await chooseSeat(2);
  expect(await screen.findByRole('radio', { name: /Seat 2,.*Holding/ })).toBeDisabled();
  expect(await screen.findByText('That seat was just taken')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('radio', { name: /Seat 2,.*Available/ })).toBeEnabled());
});
