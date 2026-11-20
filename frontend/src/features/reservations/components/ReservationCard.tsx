import Link from 'next/link';
import { ROUTES } from '@/shared/config/routes';
import type { Reservation } from '@/shared/contract';
import { formatSar } from '@/shared/lib/money';
import { formatCountdown, remainingMs } from '@/shared/lib/time';
import { StatusBadge } from './StatusBadge';

function HoldCountdown({ reservation, nowMs }: { reservation: Reservation; nowMs: number }) {
  return <p className="text-sm text-amber-800">Hold ends in {formatCountdown(remainingMs(reservation.expiresAt, nowMs))}</p>;
}

export function ReservationCard({ reservation, nowMs }: { reservation: Reservation; nowMs: number | null }) {
  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <Link prefetch={false} href={ROUTES.reservation(reservation.id)} className="block space-y-2 rounded-lg focus-visible:outline-2 focus-visible:outline-teal-600">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-slate-900">{reservation.jameyaName}</p>
          <StatusBadge status={reservation.status} />
        </div>
        <p className="text-sm text-slate-600">Seat {reservation.seatNumber} · Fee {formatSar(reservation.fee)}</p>
        {reservation.status === 'HELD' && nowMs !== null ? <HoldCountdown reservation={reservation} nowMs={nowMs} /> : null}
      </Link>
    </li>
  );
}
