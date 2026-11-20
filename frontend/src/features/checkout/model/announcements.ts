import type { CheckoutPhase, CheckoutState } from './checkout-machine';

/** Screen-reader messages for phase changes. Only transitions are announced, never ticking timers. */
const ANNOUNCEMENTS: Partial<Record<CheckoutPhase, string>> = {
  held: 'Seat held. Choose a payment method to confirm it.',
  paying: 'Payment is being confirmed with the provider.',
  confirmed: 'Seat confirmed.',
  failed: 'The payment did not complete. You were not charged.',
  expired: 'Your hold has expired.',
  cancelled: 'Seat released.',
};

export function announcementFor(state: CheckoutState): string | null {
  return ANNOUNCEMENTS[state.phase] ?? null;
}
