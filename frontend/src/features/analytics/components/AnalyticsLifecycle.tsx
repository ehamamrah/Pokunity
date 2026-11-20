'use client';

import { useEffect } from 'react';
import { analytics } from '../api/analytics-instance';

/** Registers page-hide listeners and returns the matching cleanup. */
function subscribeToPageHide(): () => void {
  const flushOnHide = () => analytics.flushOnHide();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flushOnHide();
  };
  window.addEventListener('pagehide', flushOnHide);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('pagehide', flushOnHide);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** Flushes the queue when the page is being hidden or unloaded, so events are not lost. */
export function AnalyticsLifecycle() {
  useEffect(() => subscribeToPageHide(), []);
  return null;
}
