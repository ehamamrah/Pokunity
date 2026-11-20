import type { JameyaBadge, JameyaSummary } from '@/shared/contract';

export interface BadgePresentation {
  label: string;
  tone: 'brand' | 'warning' | 'info' | 'success' | 'neutral';
}

/** Strategy map: each badge decides its own copy and tone. Labels are factual, never inflated. */
const BADGE_STRATEGIES: Record<JameyaBadge, (jameya: JameyaSummary) => BadgePresentation> = {
  FEATURED: () => ({ label: 'Featured', tone: 'brand' }),
  ALMOST_FULL: (jameya) => ({
    label: `Only ${jameya.seatsAvailable} ${jameya.seatsAvailable === 1 ? 'seat' : 'seats'} left`,
    tone: 'warning',
  }),
  STARTING_SOON: () => ({ label: 'Starting soon', tone: 'info' }),
  NEW: () => ({ label: 'New', tone: 'neutral' }),
  BEST_MATCH: () => ({ label: 'Best match for you', tone: 'success' }),
};

export function describeBadge(badge: JameyaBadge, jameya: JameyaSummary): BadgePresentation {
  return BADGE_STRATEGIES[badge](jameya);
}

export function seatsLeftLabel(jameya: JameyaSummary): string {
  return `${jameya.seatsAvailable} of ${jameya.totalSeats} seats left`;
}
