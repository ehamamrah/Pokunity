import { expect, it, vi } from 'vitest';
import { runWhenIdle } from './idle';

it('runs the task after a tick when requestIdleCallback is unavailable', async () => {
  vi.useFakeTimers();
  const task = vi.fn();
  runWhenIdle(task);
  expect(task).not.toHaveBeenCalled();
  await vi.runOnlyPendingTimersAsync();
  expect(task).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
