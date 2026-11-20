'use client';

import { useEffect } from 'react';
import { useNow } from '@/shared/lib/use-now';
import { formatCountdown, remainingMs } from '@/shared/lib/time';
import { Alert } from '@/shared/ui';

interface HoldTimerProps {
  expiresAt: string;
  onEnded: () => void;
}

function EndedNotice() {
  return <Alert tone="warning" title="Your hold has ended">Payment is no longer possible for this seat. You can choose it again.</Alert>;
}

/** Urgency that is truthful: the countdown comes from the server's expiresAt, not a local timer. */
export function HoldTimer({ expiresAt, onEnded }: HoldTimerProps) {
  const now = useNow(1_000);
  const remaining = now === null ? null : remainingMs(expiresAt, now);
  useEffect(() => {
    if (remaining === 0) onEnded();
  }, [remaining, onEnded]);
  if (remaining === null) return null;
  if (remaining === 0) return <EndedNotice />;
  return (
    <Alert tone={remaining < 60_000 ? 'warning' : 'info'} title={`Seat held for ${formatCountdown(remaining)}`}>
      <span className="sr-only">Time left on your hold.</span> Complete payment before the hold ends.
    </Alert>
  );
}
