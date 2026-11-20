import { Alert } from '@/shared/ui';

/** Honest trade-off: early payout costs more fee; the user chooses, we do not nudge. */
export function TradeoffNote() {
  return (
    <Alert tone="info" title="Earlier seats cost more">
      Seats that pay out sooner carry a higher fee. Later seats pay out later but cost less. The fee is locked when you hold a seat.
    </Alert>
  );
}
