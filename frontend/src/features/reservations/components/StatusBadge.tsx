import { Badge } from '@/shared/ui';
import type { ReservationStatus } from '@/shared/contract';
import { STATUS_PRESENTATION } from '../model/status';

export function StatusBadge({ status }: { status: ReservationStatus }) {
  const presentation = STATUS_PRESENTATION[status];
  return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
}
