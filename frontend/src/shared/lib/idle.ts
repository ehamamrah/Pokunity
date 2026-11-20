/** Runs `task` when the browser is idle (or after `timeoutMs`), so background work never competes with input. */
export function runWhenIdle(task: () => void, timeoutMs = 2_000): void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task(), { timeout: timeoutMs });
    return;
  }
  setTimeout(task, 0);
}
