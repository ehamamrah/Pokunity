import { notFound } from 'next/navigation';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { jameyaDetailOptions } from '@/features/marketplace';
import { JameyaDetailView } from '@/features/jameya-detail';
import { serverApiClient } from '@/server/bff/server-client';
import { createQueryClient } from '@/shared/query';
import { isUuid } from '@/shared/lib/uuid';

interface JameyaPageProps {
  params: Promise<{ id: string }>;
}

/** Server component: the Jameya and its seat map arrive in the HTML, so the seat map needs no client round trip on load. */
export default async function JameyaPage({ params }: JameyaPageProps) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery(jameyaDetailOptions(id, await serverApiClient()));
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <JameyaDetailView jameyaId={id} />
    </HydrationBoundary>
  );
}
