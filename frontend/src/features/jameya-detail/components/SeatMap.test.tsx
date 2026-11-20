import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { Seat } from '@/shared/contract';
import { renderWithClient } from '@/test/render';
import { SeatMap } from './SeatMap';

const SEATS: Seat[] = [
  { seatNumber: 1, payoutMonth: '2026-12', fee: 36000, status: 'AVAILABLE', heldByViewer: false, restricted: true, restrictionReason: 'RISK_TIER' },
  { seatNumber: 2, payoutMonth: '2027-01', fee: 33000, status: 'AVAILABLE', heldByViewer: false, restricted: false, restrictionReason: null },
  { seatNumber: 3, payoutMonth: '2027-02', fee: 30000, status: 'HELD', heldByViewer: false, restricted: false, restrictionReason: null },
];

function renderMap(onSelect: (seat: number) => void = () => undefined) {
  return renderWithClient(<SeatMap seats={SEATS} selectedSeat={null} holdingSeat={null} onSelect={onSelect} />);
}

it('renders restricted seats disabled with their reason in text', () => {
  renderMap();
  expect(screen.getByRole('radio', { name: /Seat 2/ })).toBeEnabled();
  expect(screen.getByLabelText(/Seat 1,/)).toBeDisabled();
  expect(screen.getByText('Not open to your risk profile')).toBeInTheDocument();
});

it('exposes held seats as on hold, not selectable', () => {
  renderMap();
  expect(screen.getByRole('radio', { name: /Seat 3,.*On hold/ })).toBeDisabled();
});

it('is a single radio group and selects a seat with the keyboard', async () => {
  const onSelect = vi.fn();
  renderMap(onSelect);
  const group = screen.getByRole('radiogroup');
  expect(within(group).getAllByRole('radio')).toHaveLength(3);
  await userEvent.tab();
  await userEvent.keyboard(' ');
  expect(onSelect).toHaveBeenCalledWith(2);
});
