import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { JAMEYA_DEFS } from '@/mocks/fixtures';
import { summaryFor } from '@/mocks/views';
import { renderWithClient } from '@/test/render';
import type { RankedJameya } from './JameyaList';
import { JameyaList } from './JameyaList';

function itemsOf(count: number): RankedJameya[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const base = summaryFor(JAMEYA_DEFS[index % JAMEYA_DEFS.length] ?? JAMEYA_DEFS[0]!, now);
    const id = `${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000000`;
    return { jameya: { ...base, id }, position: index + 1 };
  });
}

/** Counts every request MSW sees while `action` runs. */
async function requestsDuring(action: () => Promise<void> | void): Promise<number> {
  let count = 0;
  server.events.on('request:start', () => {
    count += 1;
  });
  await action();
  server.events.removeAllListeners();
  return count;
}

it.each([6, 20])('renders %i cards with zero network requests (no per-card fetching)', async (count) => {
  const made = await requestsDuring(() => {
    renderWithClient(<JameyaList items={itemsOf(count)} experiment={null} />);
  });
  expect(made).toBe(0);
  expect(screen.getAllByRole('link')).toHaveLength(count);
});

function realItems(): RankedJameya[] {
  const now = Date.now();
  return JAMEYA_DEFS.slice(0, 3).map((def, index) => ({ jameya: summaryFor(def, now), position: index + 1 }));
}

function countDetailRequests(): { read: () => number; stop: () => void } {
  let count = 0;
  server.events.on('request:start', ({ request }) => {
    if (/\/jameyas\/[0-9a-f-]{36}$/.test(new URL(request.url).pathname)) count += 1;
  });
  return { read: () => count, stop: () => server.events.removeAllListeners() };
}

it('warms a card detail once on hover, and not again on the next hover', async () => {
  const user = userEvent.setup();
  renderWithClient(<JameyaList items={realItems()} experiment={null} />);
  const link = screen.getAllByRole('link')[0];
  if (!link) throw new Error('expected a card link');
  const detail = countDetailRequests();
  await user.hover(link);
  await waitFor(() => expect(detail.read()).toBe(1));
  await user.unhover(link);
  await user.hover(link);
  expect(detail.read()).toBe(1);
  detail.stop();
});
