import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { server } from '@/mocks/server';
import type { Reservation } from '@/shared/contract';
import { renderWithClient } from '@/test/render';
import { CheckoutSession } from './CheckoutSession';

const BASE = 'http://localhost:3000/api/v1';

const held: Reservation = {
  id: 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f',
  jameyaId: '5f8a1c3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b',
  jameyaName: 'Riyadh Savers 12M',
  seatNumber: 7,
  fee: 12000,
  monthlyAmount: 100000,
  currency: 'SAR',
  status: 'HELD',
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
  failureReason: null,
  payment: null,
  createdAt: '2026-11-21T10:00:00.000Z',
  updatedAt: '2026-11-21T10:00:00.000Z',
};

function pending(status: Reservation['status'], failureReason: Reservation['failureReason'] = null): Reservation {
  return {
    ...held,
    status,
    failureReason,
    payment: { id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b', status: 'AUTHORIZING', amount: 12000, currency: 'SAR' },
  };
}

function renderSession(reservation: Reservation) {
  return renderWithClient(<CheckoutSession reservation={reservation} />);
}

it('never shows success optimistically: a 202 only shows the paying state', async () => {
  server.use(http.post(`${BASE}/reservations/${held.id}/checkout`, () => HttpResponse.json(pending('PAYMENT_PENDING'), { status: 202 })));
  const user = userEvent.setup();
  renderSession(held);
  await user.click(screen.getByRole('button', { name: /Pay SAR 120.00/ }));
  expect(await screen.findByText('Confirming your payment')).toBeInTheDocument();
  expect(screen.queryByText('Your seat is confirmed')).not.toBeInTheDocument();
});

it('shows confirmed only when the server reports CONFIRMED', async () => {
  renderSession(pending('CONFIRMED'));
  expect(await screen.findByText('Your seat is confirmed')).toBeInTheDocument();
});

it('explains a decline with the no-charge message', async () => {
  renderSession(pending('FAILED', 'PAYMENT_DECLINED'));
  expect(await screen.findByText('Payment was declined')).toBeInTheDocument();
  expect(screen.getByText(/Your card was not charged/)).toBeInTheDocument();
});
