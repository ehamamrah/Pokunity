import { QueryClient } from '@tanstack/react-query';

/** Observers read the cache, which is where structural sharing applies (fetchQuery resolves with the raw value). */
import { expect, it } from 'vitest';

interface Page {
  data: Array<{ id: string; seatsAvailable: number }>;
  meta: { asOf: string };
}

function cached(queryClient: QueryClient, key: string[]): Page {
  const value = queryClient.getQueryData<Page>(key);
  if (!value) throw new Error('expected cached data');
  return value;
}

function page(asOf: string): Page {
  return { data: [{ id: 'j-1', seatsAvailable: 3 }, { id: 'j-2', seatsAvailable: 5 }], meta: { asOf } };
}

it('keeps unchanged items by reference when a refetch returns the same content', async () => {
  const queryClient = new QueryClient();
  const key = ['structural', 'list'];
  await queryClient.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(page('10:00:00')) });
  const first = cached(queryClient, key);
  await queryClient.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(page('10:00:05')), staleTime: 0 });
  const second = cached(queryClient, key);
  expect(second.data[0]).toBe(first.data[0]);
  expect(second.data[1]).toBe(first.data[1]);
  expect(second.meta.asOf).toBe('10:00:05');
});

it('replaces an item only when its content changes', async () => {
  const queryClient = new QueryClient();
  const key = ['structural', 'changed'];
  await queryClient.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(page('10:00:00')) });
  const first = cached(queryClient, key);
  const next = page('10:00:05');
  next.data[0] = { id: 'j-1', seatsAvailable: 2 };
  await queryClient.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(next), staleTime: 0 });
  const second = cached(queryClient, key);
  expect(second.data[0]).not.toBe(first.data[0]);
  expect(second.data[1]).toBe(first.data[1]);
});
