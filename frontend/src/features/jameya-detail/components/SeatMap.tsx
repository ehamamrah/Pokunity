'use client';

import { useId } from 'react';
import type { Seat } from '@/shared/contract';
import { SeatLegend } from './SeatLegend';
import { SeatOption } from './SeatOption';

interface SeatGridProps {
  seats: Seat[];
  groupName: string;
  selectedSeat: number | null;
  holdingSeat: number | null;
  onSelect: (seatNumber: number) => void;
}

function SeatGrid({ seats, groupName, selectedSeat, holdingSeat, onSelect }: SeatGridProps) {
  return (
    <div role="radiogroup" aria-labelledby={`${groupName}-heading`} className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {seats.map((seat) => (
        <SeatOption key={seat.seatNumber} seat={seat} name={groupName} selected={selectedSeat === seat.seatNumber} holdingSeat={holdingSeat} onSelect={onSelect} />
      ))}
    </div>
  );
}

interface SeatMapProps {
  seats: Seat[];
  selectedSeat: number | null;
  holdingSeat: number | null;
  onSelect: (seatNumber: number) => void;
}

/** Radio group semantics: one tab stop, arrow keys move between seats (WAI-ARIA radio group). */
export function SeatMap({ seats, selectedSeat, holdingSeat, onSelect }: SeatMapProps) {
  const groupId = useId();
  return (
    <section aria-labelledby={`${groupId}-heading`} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${groupId}-heading`} className="text-base font-semibold text-slate-900">Choose your seat</h2>
        <p className="text-xs text-slate-500">Use arrow keys to move between seats.</p>
      </div>
      <SeatLegend />
      <SeatGrid seats={seats} groupName={`seat-${groupId}`} selectedSeat={selectedSeat} holdingSeat={holdingSeat} onSelect={onSelect} />
    </section>
  );
}
