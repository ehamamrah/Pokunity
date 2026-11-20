import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderWithClient } from '@/test/render';
import { DEFAULT_FILTERS, type MarketplaceFilters } from '../model/filters';
import { FilterBar } from './FilterBar';

it('sends one search for a burst of keystrokes, after the input pauses', async () => {
  const onApply = vi.fn((_next: MarketplaceFilters) => undefined);
  renderWithClient(<FilterBar filters={DEFAULT_FILTERS} onApply={onApply} />);
  await userEvent.type(screen.getByLabelText('Search by name'), 'Riyadh');
  await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  expect(onApply.mock.calls[0]?.[0].q).toBe('Riyadh');
});
