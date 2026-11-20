import { ProgressBar } from '@/shared/ui';
import type { JameyaSummary } from '@/shared/contract';
import { seatsLeftLabel } from '../model/badges';

export function SeatsLeft({ jameya }: { jameya: JameyaSummary }) {
  const label = seatsLeftLabel(jameya);
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-600">{label}</p>
      <ProgressBar
        value={jameya.seatsAvailable}
        max={jameya.totalSeats}
        label={`${jameya.name}: ${label}`}
        tone={jameya.seatsAvailable <= 2 ? 'warning' : 'brand'}
      />
    </div>
  );
}
