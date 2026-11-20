'use client';

import { notFound } from 'next/navigation';
import { isApiError } from '@/shared/api-client';
import { Alert, SkeletonCards } from '@/shared/ui';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { useJameyaDetailFlow, type DetailFlow } from '../hooks/use-jameya-detail-flow';
import { JameyaDetailBody } from './JameyaDetailBody';

function LoadFailure({ flow }: { flow: DetailFlow }) {
  if (isApiError(flow.loadError) && flow.loadError.code === 'NOT_FOUND') notFound();
  return <Alert tone="danger" title="We could not load this Jameya">Check your connection and refresh the page.</Alert>;
}

/** Container: loads the detail, owns the reserve flow, and maps load failures to states. */
export function JameyaDetailView({ jameyaId }: { jameyaId: string }) {
  const flow = useJameyaDetailFlow(jameyaId);
  if (flow.loading) return <SkeletonCards count={3} />;
  if (!flow.detail) return <LoadFailure flow={flow} />;
  return (
    <ErrorBoundary label="Seat map">
      <JameyaDetailBody detail={flow.detail} flow={flow} />
    </ErrorBoundary>
  );
}
