import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PayingNotice } from './PayingNotice';

it('states the latest time the result is guaranteed, when the server gives one', () => {
  render(<PayingNotice resolveBy="2026-11-21T10:10:00.000Z" />);
  expect(screen.getByText(/You will have the result by \d{2}:\d{2} at the latest/)).toBeInTheDocument();
});

it('falls back to the generic copy without a deadline', () => {
  render(<PayingNotice resolveBy={null} />);
  expect(screen.getByText(/This can take a few seconds/)).toBeInTheDocument();
});
