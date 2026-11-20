import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

const hiddenTab = () => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
const visibleTab = () => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  visibleTab();
  vi.useRealTimers();
});

it('does not poll a query while the tab is hidden', async () => {
  hiddenTab();
  const queryClient = new QueryClient({ defaultOptions: { queries: { refetchIntervalInBackground: false } } });
  const queryFn = vi.fn(() => Promise.resolve('value'));
  const observer = new QueryObserver(queryClient, { queryKey: ['poll-hidden'], queryFn, refetchInterval: 1_000, refetchIntervalInBackground: false });
  const unsubscribe = observer.subscribe(() => undefined);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(queryFn).toHaveBeenCalledTimes(1);
  unsubscribe();
});

it('polls a visible tab on the configured interval', async () => {
  visibleTab();
  const queryClient = new QueryClient();
  const queryFn = vi.fn(() => Promise.resolve('value'));
  const observer = new QueryObserver(queryClient, { queryKey: ['poll-visible'], queryFn, refetchInterval: 1_000, refetchIntervalInBackground: false });
  const unsubscribe = observer.subscribe(() => undefined);
  await vi.advanceTimersByTimeAsync(3_000);
  expect(queryFn.mock.calls.length).toBeGreaterThanOrEqual(3);
  unsubscribe();
});
