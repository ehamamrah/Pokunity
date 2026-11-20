'use client';

import Link from 'next/link';
import { useRef, type ReactNode } from 'react';
import { ROUTES } from '@/shared/config/routes';
import type { JameyaSummary } from '@/shared/contract';
import { analytics, type AnalyticsSurface, type ExperimentAssignment, type ImpressionLedger } from '@/features/analytics';
import { useImpression } from '../hooks/use-impression';
import { JameyaBadges } from './JameyaBadges';
import { JameyaFacts } from './JameyaFacts';
import { RankingReasons } from './RankingReasons';
import { SeatsLeft } from './SeatsLeft';

export interface JameyaCardProps {
  jameya: JameyaSummary;
  position: number;
  surface: AnalyticsSurface;
  experiment: ExperimentAssignment | null;
  ledger: ImpressionLedger;
  className?: string;
}

interface CardLinkProps {
  jameya: JameyaSummary;
  position: number;
  surface: AnalyticsSurface;
  experiment: ExperimentAssignment | null;
  children: ReactNode;
}

/** The whole card body is one link, so the click target is large (WCAG 2.5.8). */
function CardLink({ jameya, position, surface, experiment, children }: CardLinkProps) {
  const onNavigate = () => analytics.track({ type: 'click', jameyaId: jameya.id, surface, position, experiment });
  return (
    <Link href={ROUTES.jameya(jameya.id)} onClick={onNavigate} className="flex flex-1 flex-col gap-4 rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-teal-600">
      {children}
    </Link>
  );
}

function CardBody({ jameya }: { jameya: JameyaSummary }) {
  return (
    <>
      <h3 className="text-base font-semibold text-slate-900">{jameya.name}</h3>
      <JameyaBadges jameya={jameya} />
      <JameyaFacts jameya={jameya} />
      <SeatsLeft jameya={jameya} />
    </>
  );
}

/** Container: wires impression tracking; the body is presentational. */
export function JameyaCard({ jameya, position, surface, experiment, ledger, className }: JameyaCardProps) {
  const ref = useRef<HTMLLIElement>(null);
  useImpression(ref, { jameyaId: jameya.id, surface, position, experiment }, ledger);
  return (
    <li ref={ref} className={className}>
      <article className="flex h-full flex-col rounded-2xl bg-white ring-1 ring-slate-200 transition hover:ring-teal-600">
        <CardLink jameya={jameya} position={position} surface={surface} experiment={experiment}>
          <CardBody jameya={jameya} />
        </CardLink>
        <RankingReasons reasons={jameya.ranking.reasons} />
      </article>
    </li>
  );
}
