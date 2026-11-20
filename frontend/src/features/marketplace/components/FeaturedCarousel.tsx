'use client';

import { useRef, useState, type RefObject } from 'react';
import { createImpressionLedger, type ExperimentAssignment, type ImpressionLedger } from '@/features/analytics';
import type { JameyaSummary } from '@/shared/contract';
import { Button, SkeletonCards } from '@/shared/ui';
import { JameyaCard } from './JameyaCard';

function scrollTrack(track: HTMLOListElement | null, direction: 1 | -1): void {
  track?.scrollBy({ left: direction * (track.clientWidth * 0.8), behavior: 'smooth' });
}

function CarouselControls({ trackRef }: { trackRef: RefObject<HTMLOListElement | null> }) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" aria-label="Scroll featured left" onClick={() => scrollTrack(trackRef.current, -1)}>‹</Button>
      <Button variant="secondary" aria-label="Scroll featured right" onClick={() => scrollTrack(trackRef.current, 1)}>›</Button>
    </div>
  );
}

function CarouselTrack({ items, trackRef, experiment, ledger }: { items: JameyaSummary[]; trackRef: RefObject<HTMLOListElement | null>; experiment: ExperimentAssignment | null; ledger: ImpressionLedger }) {
  return (
    <ol ref={trackRef} aria-label="Featured Jameyas" className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
      {items.map((jameya, index) => (
        <JameyaCard key={jameya.id} jameya={jameya} position={index + 1} surface="featured_carousel" experiment={experiment} ledger={ledger} className="w-72 shrink-0 snap-start sm:w-80" />
      ))}
    </ol>
  );
}

interface FeaturedCarouselProps {
  items: JameyaSummary[] | undefined;
  loading: boolean;
  experiment: ExperimentAssignment | null;
}

/** Horizontal region scrolled by its buttons (keyboard-operable). No auto-rotation (WCAG 2.2.2). */
export function FeaturedCarousel({ items, loading, experiment }: FeaturedCarouselProps) {
  const trackRef = useRef<HTMLOListElement>(null);
  const [ledger] = useState(createImpressionLedger);
  if (loading) return <SkeletonCards count={2} />;
  if (!items || items.length === 0) return null;
  return (
    <section aria-labelledby="featured-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="featured-heading" className="text-lg font-semibold text-slate-900">Featured Jameyas</h2>
        <CarouselControls trackRef={trackRef} />
      </div>
      <CarouselTrack items={items} trackRef={trackRef} experiment={experiment} ledger={ledger} />
    </section>
  );
}
