import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

let worker: ReturnType<typeof setupWorker> | null = null;

/** Dev-only: service-worker interception of /api/* so the UI runs without the backend. */
export async function startMockWorker(): Promise<void> {
  worker ??= setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: 'bypass', serviceWorker: { url: '/mockServiceWorker.js' } });
}
