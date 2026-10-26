import * as React from 'react';

/**
 * Tracks one element's live content width via ResizeObserver. A callback ref
 * (rather than useEffect) attaches the observer the moment the element
 * mounts — including the first time it appears after a loading state — and
 * detaches cleanly when it's replaced or unmounts.
 */
export function useElementWidth(): [React.RefCallback<HTMLDivElement>, number] {
  const [width, setWidth] = React.useState(0);
  const observerRef = React.useRef<ResizeObserver | null>(null);

  const ref = React.useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  return [ref, width];
}
