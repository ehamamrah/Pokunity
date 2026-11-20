'use client';

import Link from 'next/link';
import { LiveStatus } from '@/shared/ui';
import type { Reservation } from '@/shared/contract';
import { ROUTES } from '@/shared/config/routes';
import { announcementFor } from '../model/announcements';
import { isHoldActive, isTerminalPhase } from '../model/checkout-machine';
import { useCheckoutFlow, type CheckoutFlow } from '../hooks/use-checkout-flow';
import { ErrorNotice } from '@/features/reservations';
import { FeeSummary } from './FeeSummary';
import { HoldTimer } from './HoldTimer';
import { OutcomeBanner } from './OutcomeBanner';
import { PaymentPanel } from './PaymentPanel';
import { PayingNotice } from './PayingNotice';

function RejectionNotice({ flow }: { flow: CheckoutFlow }) {
  if (!flow.rejection) return null;
  return <ErrorNotice error={flow.rejection} onRefresh={flow.refresh} onRetry={flow.payNow} />;
}

function StatusNotices({ reservation, flow }: { reservation: Reservation; flow: CheckoutFlow }) {
  const phase = flow.state.phase;
  return (
    <>
      <OutcomeBanner state={flow.state} jameyaHref={ROUTES.jameya(reservation.jameyaId)} />
      {phase === 'paying' ? <PayingNotice /> : null}
      {phase === 'held' ? <HoldTimer expiresAt={reservation.expiresAt} onEnded={flow.markHoldEnded} /> : null}
    </>
  );
}

function ReservationsLink() {
  return <Link prefetch={false} href={ROUTES.reservations} className="text-sm font-semibold text-teal-800 underline">Go to my reservations</Link>;
}

/** One session per reservation (keyed by id). The state lives in useCheckoutFlow; this composes the view. */
export function CheckoutSession({ reservation }: { reservation: Reservation }) {
  const flow = useCheckoutFlow(reservation);
  return (
    <div className="space-y-6">
      <LiveStatus message={announcementFor(flow.state)} />
      <StatusNotices reservation={reservation} flow={flow} />
      <FeeSummary reservation={reservation} />
      <RejectionNotice flow={flow} />
      {isHoldActive(flow.state) ? <PaymentPanel reservation={reservation} flow={flow} /> : null}
      {isTerminalPhase(flow.state) ? <ReservationsLink /> : null}
    </div>
  );
}
