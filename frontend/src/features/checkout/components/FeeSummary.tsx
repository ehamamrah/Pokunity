import { formatFee, formatSar } from '@/shared/lib/money';
import type { Reservation } from '@/shared/contract';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </>
  );
}

function FundsNote() {
  return (
    <p className="mt-3 text-xs text-slate-600">
      You are charged only after your seat is confirmed. Before that, the provider only authorizes the amount, and the authorization is voided if the seat cannot be confirmed.
    </p>
  );
}

/** What is paid now versus what the payout is: the amounts are labelled, never implied. */
export function FeeSummary({ reservation }: { reservation: Reservation }) {
  return (
    <section aria-labelledby="fee-heading" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 id="fee-heading" className="text-base font-semibold text-slate-900">{reservation.jameyaName}, seat {reservation.seatNumber}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Row label="Monthly contribution" value={formatSar(reservation.monthlyAmount)} />
        <Row label="Seat fee (locked)" value={formatFee(reservation.fee)} />
        <Row label="Charged today" value={reservation.fee === 0 ? 'SAR 0.00' : formatSar(reservation.fee)} />
      </dl>
      <FundsNote />
    </section>
  );
}
