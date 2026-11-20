import { vi } from 'vitest';

/** Test double for next/navigation. Tests read `routerState` to assert navigation. */
export const routerState = {
  pathname: '/',
  search: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
};

export function useRouter() {
  return { push: routerState.push, replace: routerState.replace, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
}

export function usePathname() {
  return routerState.pathname;
}

export function useSearchParams() {
  return routerState.search;
}

export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND');
}
