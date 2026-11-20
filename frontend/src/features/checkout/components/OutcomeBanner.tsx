import Link from 'next/link';
import { failureCopyFor, STATUS_OUTCOME_COPY, type OutcomeCopy } from '@/features/reservations';
import { ROUTES } from '@/shared/config/routes';
import { Alert, type Tone } from '@/shared/ui';
import type { CheckoutState } from '../model/checkout-machine';

interface OutcomeBannerProps {
  state: CheckoutState;
  jameyaHref: string;
}

const TONE_BY_PHASE: Partial<Record<CheckoutState['phase'], Tone>> = { confirmed: 'success', failed: 'danger' };

function copyFor(state: CheckoutState): OutcomeCopy | null {
  switch (state.phase) {
    case 'failed':
      return failureCopyFor(state.failureReason);
    case 'expired':
      return STATUS_OUTCOME_COPY.EXPIRED ?? null;
    case 'cancelled':
      return STATUS_OUTCOME_COPY.CANCELLED ?? null;
    case 'confirmed':
      return STATUS_OUTCOME_COPY.CONFIRMED ?? null;
    default:
      return null;
  }
}

function OutcomeLinks({ retryHref, retryable }: { retryHref: string; retryable: boolean }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm font-semibold">
      {retryable ? <Link className="text-teal-800 underline" href={retryHref}>Choose a seat again</Link> : null}
      <Link className="text-teal-800 underline" href={ROUTES.reservations}>My reservations</Link>
    </div>
  );
}

/** Terminal outcomes, each with a clear next step. Only the server can set these phases. */
export function OutcomeBanner({ state, jameyaHref }: OutcomeBannerProps) {
  const copy = copyFor(state);
  if (!copy) return null;
  const retryable = state.phase === 'failed' || state.phase === 'expired';
  return (
    <Alert tone={TONE_BY_PHASE[state.phase] ?? 'neutral'} title={copy.title} action={<OutcomeLinks retryHref={jameyaHref} retryable={retryable} />}>
      {copy.body}
    </Alert>
  );
}
