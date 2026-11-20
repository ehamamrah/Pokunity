import { JameyaListing } from '../jameya';
import { RankingContext, Signals } from './ranking-context';

export type SignalName = keyof Signals;

/** Turns a strong signal into a human-readable explanation, or null if not worth showing. */
export function explain(name: SignalName, s: Signals, j: JameyaListing, _ctx: RankingContext): string | null {
  const days = j.base.daysToStart;
  const reasons: Record<SignalName, () => string | null> = {
    amountMatch: () => ((s.amountMatch ?? 0) >= 0.85 ? 'Matches your usual monthly amount' : null),
    durationMatch: () => (s.durationMatch === 1 ? `Matches your preferred ${j.durationMonths}-month duration` : null),
    scarcity: () => seatsLeft(j.seatsAvailable),
    startingSoon: () => (days >= 0 && days <= 30 ? `Starts in ${days} ${days === 1 ? 'day' : 'days'}` : null),
    freshness: () => (s.freshness >= 0.75 ? 'Newly listed' : null),
    featured: () => (s.featured === 1 ? 'Featured by Pokunity' : null),
  };
  return reasons[name]();
}

function seatsLeft(available: number): string | null {
  if (available <= 0 || available > 3) return null;
  return available === 1 ? 'Only 1 seat left' : `Only ${available} seats left`;
}
