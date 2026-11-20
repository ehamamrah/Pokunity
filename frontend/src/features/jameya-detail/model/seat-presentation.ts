import { formatFee } from '@/shared/lib/money';
import { formatPayoutMonth } from '@/shared/lib/time';
import type { RestrictionReason, Seat } from '@/shared/contract';

export type SeatKind = 'holding' | 'yours' | 'taken' | 'restricted' | 'on_hold' | 'available';

export interface SeatPresentation {
  kind: SeatKind;
  label: string;
  selectable: boolean;
  /** Explanation shown next to the seat (restriction reason, hold note). */
  detail: string | null;
  /** Whether the detail is visible text (true) or screen-reader only (false). */
  detailVisible: boolean;
}

const RESTRICTION_COPY: Record<RestrictionReason, string> = {
  KYC_REQUIRED: 'Verify your identity to reserve this seat',
  RISK_TIER: 'Not open to your risk profile',
  KYC_UNAVAILABLE: 'Verification temporarily unavailable',
};

export function restrictionCopy(reason: RestrictionReason | null): string {
  return reason ? RESTRICTION_COPY[reason] : 'Not available to you';
}

function present(kind: SeatKind, label: string, selectable: boolean, detail: string | null, detailVisible = false): SeatPresentation {
  return { kind, label, selectable, detail, detailVisible };
}

/**
 * Seat rendering rules, in precedence order. The first matching rule wins:
 * an in-flight hold of ours > our own hold > taken > restricted (with reason) >
 * held by someone else > available. Only `available` seats are selectable.
 */
export function describeSeat(seat: Seat, holdingSeatNumber: number | null): SeatPresentation {
  if (seat.seatNumber === holdingSeatNumber) return present('holding', 'Holding…', false, null);
  if (seat.heldByViewer) return present('yours', 'Your hold', false, null);
  if (seat.status === 'TAKEN') return present('taken', 'Taken', false, null);
  if (seat.restricted) return present('restricted', 'Restricted', false, restrictionCopy(seat.restrictionReason), true);
  if (seat.status === 'HELD') {
    return present('on_hold', 'On hold', false, 'Held by another member. It may free up if their hold expires.');
  }
  return present('available', 'Available', true, null);
}

/** Accessible name combines every fact a sighted user reads off the cell. */
export function seatAccessibleName(seat: Seat, presentation: SeatPresentation): string {
  return `Seat ${seat.seatNumber}, payout ${formatPayoutMonth(seat.payoutMonth)}, fee ${formatFee(seat.fee)}, ${presentation.label}`;
}
