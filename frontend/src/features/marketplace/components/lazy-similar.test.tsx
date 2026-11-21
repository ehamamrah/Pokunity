import { screen, waitFor } from '@testing-library/react';
import { act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { JAMEYA_DEFS } from '@/mocks/fixtures';
import { renderWithClient } from '@/test/render';
import { LazySimilarJameyas } from './LazySimilarJameyas';

type Callback = (entries: IntersectionObserverEntry[]) => void;
const observers: Callback[] = [];

class CapturingObserver {
  constructor(callback: Callback) {
    observers.push(callback);
  }
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
});

function scrollIntoView(): void {
  act(() => {
    observers.forEach((callback) => callback([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry]));
  });
}

it('fetches similar Jameyas only once the strip scrolls into view', async () => {
  vi.stubGlobal('IntersectionObserver', CapturingObserver);
  let requests = 0;
  server.events.on('request:start', ({ request }) => {
    if (request.url.endsWith('/similar')) requests += 1;
  });
  renderWithClient(<LazySimilarJameyas jameyaId={JAMEYA_DEFS[0]?.id ?? ''} />);
  expect(requests).toBe(0);
  scrollIntoView();
  expect(await screen.findByRole('heading', { name: 'You may also like' })).toBeInTheDocument();
  await waitFor(() => expect(requests).toBe(1));
  server.events.removeAllListeners();
});
