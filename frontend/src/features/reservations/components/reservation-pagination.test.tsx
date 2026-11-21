import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { renderWithClient } from '@/test/render';
import { routerState } from '@/test/navigation-mock';
import { ReservationList } from './ReservationList';

const ITEM = {
  id: 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f', jameyaId: '5f8a1c3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b', jameyaName: 'Riyadh Savers 12M',
  seatNumber: 7, fee: 12000, monthlyAmount: 100000, currency: 'SAR', status: 'CONFIRMED', expiresAt: '2026-11-21T10:05:00.000Z',
  failureReason: null, payment: null, createdAt: '2026-11-21T10:00:00.000Z', updatedAt: '2026-11-21T10:01:00.000Z',
};

function serveTotal(total: number): void {
  server.use(
    http.get('*/api/v1/reservations', ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
      return HttpResponse.json({ data: [ITEM], meta: { page, pageSize: 20, total } });
    }),
  );
}

it('shows the position and total, and asks for the next page', async () => {
  serveTotal(45);
  routerState.search = new URLSearchParams('page=1');
  renderWithClient(<ReservationList />);
  expect(await screen.findByText(/Page 1 of 3 · 45 in total/)).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(routerState.replace).toHaveBeenCalledWith('/reservations?page=2', { scroll: false }));
});

it('disables Previous on the first page', async () => {
  serveTotal(45);
  routerState.search = new URLSearchParams('page=1');
  renderWithClient(<ReservationList />);
  expect(await screen.findByRole('button', { name: 'Previous' })).toBeDisabled();
});
