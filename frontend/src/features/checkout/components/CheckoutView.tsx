'use client';

import { notFound } from 'next/navigation';
import { useReservation } from '@/features/reservations';
import { isApiError } from '@/shared/api-client';
import { Alert, SkeletonCards } from '@/shared/ui';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { CheckoutSession } from './CheckoutSession';

/** Container: loads the authoritative reservation (polling while it is in flight). */
export function CheckoutView({ reservationId }: { reservationId: string }) {
  const query = useReservation(reservationId);
  if (query.isPending) return <SkeletonCards count={2} />;
  if (isApiError(query.error) && (query.error.code === 'NOT_FOUND' || query.error.code === 'FORBIDDEN')) notFound();
  if (query.isError || !query.data) {
    return <Alert tone="danger" title="We could not load this reservation">Check your connection and refresh the page.</Alert>;
  }
  return (
    <ErrorBoundary label="Checkout">
      <CheckoutSession key={query.data.id} reservation={query.data} />
    </ErrorBoundary>
  );
}
