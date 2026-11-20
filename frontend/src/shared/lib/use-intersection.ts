'use client';

import { useEffect, useRef, type RefObject } from 'react';

export interface IntersectionOptions {
  threshold: number;
  enabled?: boolean;
  onIntersect: () => void;
}

function isVisible(entry: IntersectionObserverEntry, threshold: number): boolean {
  return entry.isIntersecting && entry.intersectionRatio >= threshold;
}

/** Observer pattern: fires `onVisible` whenever the node crosses `threshold` visibility. */
export function observeVisibility(node: Element, threshold: number, onVisible: () => void): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => isVisible(entry, threshold))) onVisible();
    },
    { threshold: [threshold] },
  );
  observer.observe(node);
  return () => {
    observer.disconnect();
  };
}

/** Keeps the latest callback in a ref so the observer is not recreated on every render. */
function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function useIntersection(target: RefObject<Element | null>, options: IntersectionOptions): void {
  const { threshold, enabled = true, onIntersect } = options;
  const callback = useLatest(onIntersect);
  useEffect(() => {
    const node = target.current;
    if (!enabled || !node || typeof IntersectionObserver === 'undefined') return undefined;
    return observeVisibility(node, threshold, () => {
      callback.current();
    });
  }, [target, threshold, enabled, callback]);
}
