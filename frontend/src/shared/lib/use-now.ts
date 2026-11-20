'use client';

import { useEffect, useState } from 'react';

/**
 * Wall-clock ticker. Returns null until mounted so server and client render the same
 * markup (avoids hydration drift for countdowns and "updated Xs ago").
 */
export function useNow(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
