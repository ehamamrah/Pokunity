import { BaseSignals, daysSince, daysUntil, JameyaRow } from '../jameya';
import { RankingContext, Signals } from './ranking-context';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function amountMatch(monthly: number, typical: number | null): number | null {
  if (!typical) return null;
  return clamp01(1 - Math.abs(monthly - typical) / typical);
}

export function durationMatch(duration: number, preferred: number[]): number | null {
  if (preferred.length === 0) return null;
  let distance = Infinity;
  for (const p of preferred) distance = Math.min(distance, Math.abs(p - duration));
  return clamp01(1 - distance / 6);
}

/** 1 when starting within 14 days, decaying linearly to 0 at 120 days. */
export function startingSoon(days: number): number {
  if (days < 0) return 0;
  return days <= 14 ? 1 : clamp01(1 - (days - 14) / 106);
}

/** Computed once per snapshot refresh for every listing. */
export function baseSignalsOf(j: JameyaRow, now: Date, featuredIds: ReadonlySet<string>): BaseSignals {
  const daysToStart = daysUntil(j.startDate, now);
  const ageDays = daysSince(j.createdAt, now);
  return {
    scarcity: j.totalSeats > 0 ? clamp01(1 - j.seatsAvailable / j.totalSeats) : 0,
    startingSoon: startingSoon(daysToStart),
    freshness: clamp01(1 - ageDays / 30),
    featured: featuredIds.has(j.id) ? 1 : 0,
    daysToStart,
    ageDays,
  };
}

export function computeSignals(j: { monthlyAmount: number; durationMonths: number; base: BaseSignals }, ctx: RankingContext): Signals {
  const { scarcity, startingSoon: soon, freshness, featured } = j.base;
  return {
    amountMatch: amountMatch(j.monthlyAmount, ctx.typicalMonthlyAmount),
    durationMatch: durationMatch(j.durationMonths, ctx.preferredDurations),
    scarcity, startingSoon: soon, freshness, featured,
  };
}
