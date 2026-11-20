'use client';

import { useState } from 'react';
import { createImpressionLedger, type ExperimentAssignment } from '@/features/analytics';
import type { JameyaSummary } from '@/shared/contract';
import { JameyaCard } from './JameyaCard';

export interface RankedJameya {
  jameya: JameyaSummary;
  position: number;
}

interface JameyaListProps {
  items: RankedJameya[];
  experiment: ExperimentAssignment | null;
}

/** One impression ledger per page view, shared by every card on the page. */
export function JameyaList({ items, experiment }: JameyaListProps) {
  const [ledger] = useState(createImpressionLedger);
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Jameyas">
      {items.map(({ jameya, position }) => (
        <JameyaCard key={jameya.id} jameya={jameya} position={position} surface="marketplace_list" experiment={experiment} ledger={ledger} />
      ))}
    </ul>
  );
}
