import type { Reservation } from '@/shared/contract';
import { ReservationCard } from './ReservationCard';

interface ReservationGroupProps {
  id: string;
  heading: string;
  items: Reservation[];
  nowMs: number | null;
}

export function ReservationGroup({ id, heading, items, nowMs }: ReservationGroupProps) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-base font-semibold text-slate-900">
        {heading} <span className="font-normal text-slate-500">({items.length})</span>
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((reservation) => (
          <ReservationCard key={reservation.id} reservation={reservation} nowMs={nowMs} />
        ))}
      </ul>
    </section>
  );
}
