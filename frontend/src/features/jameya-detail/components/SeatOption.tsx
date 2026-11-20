import { cn } from '@/shared/lib/cn';
import { formatFee } from '@/shared/lib/money';
import { formatPayoutMonth } from '@/shared/lib/time';
import type { Seat } from '@/shared/contract';
import { describeSeat, seatAccessibleName, type SeatKind, type SeatPresentation } from '../model/seat-presentation';

interface SeatOptionProps {
  seat: Seat;
  name: string;
  selected: boolean;
  holdingSeat: number | null;
  onSelect: (seatNumber: number) => void;
}

const KIND_CLASSES: Record<SeatKind, string> = {
  available: 'bg-white text-slate-900 ring-slate-300 hover:ring-teal-600 peer-focus-visible:ring-teal-600',
  holding: 'bg-amber-50 text-amber-900 ring-amber-400 animate-pulse motion-reduce:animate-none',
  yours: 'bg-teal-50 text-teal-900 ring-teal-500',
  on_hold: 'bg-slate-100 text-slate-500 ring-slate-300',
  taken: 'bg-slate-200 text-slate-500 ring-slate-300 line-through',
  restricted: 'bg-slate-50 text-slate-400 ring-dashed ring-slate-300',
};

function cellClasses(presentation: SeatPresentation, selected: boolean): string {
  return cn(
    'relative flex min-h-20 flex-col justify-between rounded-lg p-2 text-left ring-1 transition',
    presentation.selectable ? 'cursor-pointer' : 'cursor-not-allowed',
    selected ? 'ring-2 ring-teal-700' : '',
    KIND_CLASSES[presentation.kind],
  );
}

function SeatDetail({ id, presentation }: { id: string; presentation: SeatPresentation }) {
  if (!presentation.detail) return null;
  if (!presentation.detailVisible) return <span id={id} className="sr-only">{presentation.detail}</span>;
  return <span id={id} className="text-[11px] leading-tight">{presentation.detail}</span>;
}

function SeatRadio({ seat, name, selected, presentation, detailId, onSelect }: { seat: Seat; name: string; selected: boolean; presentation: SeatPresentation; detailId: string; onSelect: (n: number) => void }) {
  return (
    <input
      type="radio"
      name={name}
      value={seat.seatNumber}
      checked={selected}
      disabled={!presentation.selectable}
      onChange={() => onSelect(seat.seatNumber)}
      aria-label={seatAccessibleName(seat, presentation)}
      aria-describedby={presentation.detail ? detailId : undefined}
      className="peer sr-only"
    />
  );
}

/** A native radio: arrow keys, Space and screen-reader semantics come for free. */
export function SeatOption({ seat, name, selected, holdingSeat, onSelect }: SeatOptionProps) {
  const presentation = describeSeat(seat, holdingSeat);
  const detailId = `${name}-${seat.seatNumber}-detail`;
  return (
    <label className={cellClasses(presentation, selected)}>
      <SeatRadio seat={seat} name={name} selected={selected} presentation={presentation} detailId={detailId} onSelect={onSelect} />
      <span className="text-sm font-bold">#{seat.seatNumber}</span>
      <span className="text-[11px] leading-tight">{formatPayoutMonth(seat.payoutMonth)} · {formatFee(seat.fee)}</span>
      <span className="text-[11px] font-semibold leading-tight">{presentation.label}</span>
      <SeatDetail id={detailId} presentation={presentation} />
    </label>
  );
}
