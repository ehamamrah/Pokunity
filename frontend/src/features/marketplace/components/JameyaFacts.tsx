import { formatFeeRange, formatSar } from '@/shared/lib/money';
import { formatStartDate } from '@/shared/lib/time';
import type { JameyaSummary } from '@/shared/contract';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

/** Money and dates are rendered with explicit units and ranges; no ambiguous numbers. */
export function JameyaFacts({ jameya }: { jameya: JameyaSummary }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      <Fact label="Monthly" value={formatSar(jameya.monthlyAmount)} />
      <Fact label="Duration" value={`${jameya.durationMonths} months`} />
      <Fact label="Payout" value={formatSar(jameya.payoutAmount)} />
      <Fact label="Fee range" value={formatFeeRange(jameya.minFee, jameya.maxFee)} />
      <Fact label="Starts" value={formatStartDate(jameya.startDate)} />
    </dl>
  );
}
