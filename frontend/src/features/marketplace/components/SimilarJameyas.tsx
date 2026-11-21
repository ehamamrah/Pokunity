'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { createImpressionLedger, type ExperimentAssignment, type ImpressionLedger } from '@/features/analytics';
import { isApiError } from '@/shared/api-client';
import { Alert, EmptyState, SkeletonCards } from '@/shared/ui';
import { similarOptions } from '../api/jameya-catalog';
import type { SimilarPage } from '../model/types';
import { JameyaCard } from './JameyaCard';

function SimilarEmpty() {
  return <EmptyState title="Nothing similar is open right now">Try the marketplace, where new Jameyas open regularly.</EmptyState>;
}

function SimilarError({ error }: { error: unknown }) {
  const copy = isApiError(error) && error.code === 'SERVICE_UNAVAILABLE' ? 'Pokunity is recovering. Try again shortly.' : 'We could not load similar Jameyas.';
  return <Alert tone="warning" title="Similar Jameyas">{copy}</Alert>;
}

function SimilarGrid({ items, experiment, heading, ledger }: { items: SimilarPage['data']; experiment: ExperimentAssignment | null; heading: string; ledger: ImpressionLedger }) {
  return (
    <section aria-label={heading} className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((jameya, index) => (
          <JameyaCard key={jameya.id} jameya={jameya} position={index + 1} surface="jameya_detail" experiment={experiment} ledger={ledger} />
        ))}
      </ol>
    </section>
  );
}

/** Similar Jameyas for a full or unavailable one. Cards are the same component the marketplace uses, so analytics and layout match. */
export function SimilarJameyas({ jameyaId, heading = 'Similar Jameyas' }: { jameyaId: string; heading?: string }) {
  const query = useQuery(similarOptions(jameyaId));
  const [ledger] = useState(createImpressionLedger);
  if (query.isPending) return <SkeletonCards count={2} />;
  if (query.isError) return <SimilarError error={query.error} />;
  if (query.data.data.length === 0) return <SimilarEmpty />;
  return <SimilarGrid items={query.data.data} experiment={query.data.meta.experiment ?? null} heading={heading} ledger={ledger} />;
}
