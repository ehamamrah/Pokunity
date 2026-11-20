'use client';

import type { Reservation } from '@/shared/contract';
import type { CheckoutFlow } from '../hooks/use-checkout-flow';
import { CheckoutActions } from './CheckoutActions';
import { PaymentMethodPicker } from './PaymentMethodPicker';

function HoldEndedNote() {
  return <p className="text-sm text-amber-900">The hold has ended, so payment is disabled. Choose the seat again.</p>;
}

/** Payment controls, shown only while a hold is active (held or paying). Free seats skip the method picker. */
export function PaymentPanel({ reservation, flow }: { reservation: Reservation; flow: CheckoutFlow }) {
  return (
    <div className="space-y-6">
      {reservation.fee === 0 ? null : <PaymentMethodPicker value={flow.token} disabled={flow.state.phase !== 'held'} onChange={flow.setToken} />}
      <CheckoutActions reservation={reservation} flow={flow} />
      {flow.holdEnded ? <HoldEndedNote /> : null}
    </div>
  );
}
