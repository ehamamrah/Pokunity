'use client';

import { Button } from '@/shared/ui';
import { formatSar } from '@/shared/lib/money';
import type { Reservation } from '@/shared/contract';
import type { CheckoutFlow } from '../hooks/use-checkout-flow';

function payLabel(reservation: Reservation): string {
  return reservation.fee === 0 ? 'Confirm seat (no fee)' : `Pay ${formatSar(reservation.fee)} & confirm seat`;
}

interface CheckoutActionsProps {
  reservation: Reservation;
  flow: CheckoutFlow;
}

/** Pay and release controls. Pay is disabled unless the machine is in `held` and the hold is live. */
export function CheckoutActions({ reservation, flow }: CheckoutActionsProps) {
  const payable = flow.state.phase === 'held' && !flow.holdEnded;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Button className="sm:flex-1" onClick={flow.payNow} disabled={!payable || flow.paying}>
        {flow.paying ? 'Sending to provider…' : payLabel(reservation)}
      </Button>
      <Button variant="secondary" onClick={flow.releaseNow} disabled={flow.releasing || flow.paying}>
        {flow.releasing ? 'Releasing…' : 'Release seat'}
      </Button>
    </div>
  );
}
