import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { JAMEYA_DEFS } from '@/mocks/fixtures';
import { renderWithClient } from '@/test/render';
import { JameyaDetailView } from '../components/JameyaDetailView';

const JAMEYA = JAMEYA_DEFS[0];
const BASE = 'http://localhost:3000/api/v1';

function jameyaFull(): void {
  server.use(http.post(`${BASE}/reservations`, () => HttpResponse.json({ error: { code: 'JAMEYA_FULL', message: 'x', details: { jameyaId: JAMEYA?.id }, traceId: 't' } }, { status: 409 })));
}

async function holdSeat(seatNumber: number): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('radio', { name: new RegExp(`Seat ${seatNumber},`) }));
  await user.click(screen.getByRole('button', { name: new RegExp(`Hold seat ${seatNumber}`) }));
}

it('shows similar Jameyas inline when the Jameya is full', async () => {
  jameyaFull();
  renderWithClient(<JameyaDetailView jameyaId={JAMEYA?.id ?? ''} />);
  await holdSeat(2);
  expect(await screen.findByRole('heading', { name: 'Similar Jameyas' })).toBeInTheDocument();
  expect(await screen.findByText(JAMEYA_DEFS[1]?.name ?? '')).toBeInTheDocument();
});

it('explains an empty similar list instead of showing nothing', async () => {
  jameyaFull();
  server.use(http.get(`${BASE}/jameyas/:id/similar`, () => HttpResponse.json({ data: [], meta: { asOf: new Date().toISOString() } })));
  renderWithClient(<JameyaDetailView jameyaId={JAMEYA?.id ?? ''} />);
  await holdSeat(2);
  expect(await screen.findByText('Nothing similar is open right now')).toBeInTheDocument();
});
