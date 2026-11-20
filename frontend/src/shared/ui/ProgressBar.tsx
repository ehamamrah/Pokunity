import { cn } from '../lib/cn';

export interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  tone?: 'brand' | 'warning';
}

function percentOf(value: number, max: number): number {
  return max === 0 ? 0 : Math.round((value / max) * 100);
}

export function ProgressBar({ value, max, label, tone = 'brand' }: ProgressBarProps) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={cn('h-full rounded-full', tone === 'warning' ? 'bg-amber-500' : 'bg-teal-600')}
        style={{ width: `${percentOf(value, max)}%` }}
      />
    </div>
  );
}
