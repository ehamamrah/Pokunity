'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AnalyticsLifecycle } from '@/features/analytics';
import { createQueryClient } from '@/shared/query';

/** Starts the dev-only MSW worker and reports readiness. Dead code when mocking is off. */
/*
 * The env check is written as a literal here, not read from an exported constant: the build
 * replaces it with a constant and drops the dynamic import, so MSW never ships to production.
 */
function startWhenEnabled(onReady: () => void): (() => void) | undefined {
  if (process.env.NEXT_PUBLIC_API_MOCKING !== 'enabled') return undefined;
  let active = true;
  void import('@/mocks/browser').then(async ({ startMockWorker }) => {
    await startMockWorker();
    if (active) onReady();
  });
  return () => {
    active = false;
  };
}

function MockingGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(process.env.NEXT_PUBLIC_API_MOCKING !== 'enabled');
  useEffect(() => startWhenEnabled(() => setReady(true)), []);
  if (!ready) return <p className="p-8 text-sm text-slate-600">Starting demo mode…</p>;
  return children;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <MockingGate>{children}</MockingGate>
      <AnalyticsLifecycle />
    </QueryClientProvider>
  );
}
