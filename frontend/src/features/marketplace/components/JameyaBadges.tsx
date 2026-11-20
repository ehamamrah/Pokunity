import { Badge } from '@/shared/ui';
import type { JameyaSummary } from '@/shared/contract';
import { describeBadge } from '../model/badges';

export function JameyaBadges({ jameya }: { jameya: JameyaSummary }) {
  if (jameya.badges.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Badges">
      {jameya.badges.map((badge) => {
        const presentation = describeBadge(badge, jameya);
        return (
          <li key={badge}>
            <Badge tone={presentation.tone}>{presentation.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}
