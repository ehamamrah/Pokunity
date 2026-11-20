import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './use-debounced-value';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('emits only the last value once typing pauses for the delay', () => {
  const { result, rerender } = renderHook(({ value }: { value: string }) => useDebouncedValue(value, 300), { initialProps: { value: 'R' } });
  rerender({ value: 'Ri' });
  rerender({ value: 'Riy' });
  expect(result.current).toBe('R');
  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(result.current).toBe('Riy');
});
