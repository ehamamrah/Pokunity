'use client';

import Link from 'next/link';
import { ErrorNotice, type ErrorPresentation } from '@/features/reservations';
import type { JameyaDetail, Seat } from '@/shared/contract';
import { formatFee } from '@/shared/lib/money';
import { formatPayoutMonth } from '@/shared/lib/time';
import { Alert, Button } from '@/shared/ui';
import { restrictionCopy } from '../model/seat-presentation';

function SeatSummary({ seat }: { seat: Seat | null }) {
  if (!seat) return <p className="text-sm text-slate-600">Pick an available seat on the map.</p>;
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <dt className="text-slate-500">Seat</dt>
      <dd className="font-semibold">#{seat.seatNumber}</dd>
      <dt className="text-slate-500">Payout month</dt>
      <dd className="font-semibold">{formatPayoutMonth(seat.payoutMonth)}</dd>
      <dt className="text-slate-500">Fee</dt>
      <dd className="font-semibold">{formatFee(seat.fee)}</dd>
    </dl>
  );
}

function ViewerNotices({ detail, seat }: { detail: JameyaDetail; seat: Seat | null }) {
  return (
    <>
      {detail.viewer.blockingReason && !seat ? (
        <Alert tone="warning" title="You cannot reserve yet">{restrictionCopy(detail.viewer.blockingReason)}</Alert>
      ) : null}
      {detail.viewer.activeReservationId ? (
        <Link prefetch={false} href={`/reservations/${detail.viewer.activeReservationId}`} className="text-sm font-semibold text-teal-800 underline">
          View your current hold
        </Link>
      ) : null}
    </>
  );
}

interface ReservePanelProps {
  detail: JameyaDetail;
  seat: Seat | null;
  reserving: boolean;
  error: ErrorPresentation | null;
  onReserve: () => void;
  onRefresh: () => void;
}

/** Summary of what the user is about to hold, and what it will (not) cost now. */
export function ReservePanel({ detail, seat, reserving, error, onReserve, onRefresh }: ReservePanelProps) {
  const label = reserving ? 'Holding seat…' : seat ? `Hold seat ${seat.seatNumber}` : 'Select a seat to hold';
  return (
    <aside aria-labelledby="reserve-heading" className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200 lg:sticky lg:top-6">
      <h2 id="reserve-heading" className="text-base font-semibold text-slate-900">Your seat</h2>
      <SeatSummary seat={seat} />
      <ViewerNotices detail={detail} seat={seat} />
      <Button className="w-full" disabled={!seat || reserving || !detail.viewer.canReserve} onClick={onReserve}>{label}</Button>
      <p className="text-xs text-slate-600">
        Holding a seat is free and lasts a few minutes. You are charged only when your seat is confirmed on the next step.
      </p>
      {error ? <ErrorNotice error={error} onRefresh={onRefresh} onRetry={onReserve} /> : null}
    </aside>
  );
}
