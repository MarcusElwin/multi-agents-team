'use client';

import { useEffect, useRef } from 'react';

/**
 * Tracks how long a page/section is actively viewed. Calls `onOpen` once when it
 * mounts and `onClose(seconds)` with the active seconds whenever the view is
 * hidden (tab switch / navigation away) or unmounted.
 *
 * A plain unmount cleanup misses tab closes and bfcache navigations, so we also
 * flush on `visibilitychange → hidden` and `pagehide`. Each active segment is
 * reported separately: switching away and back splits the visit into multiple
 * `onClose` calls rather than one inflated total. A `flushed` guard prevents the
 * same segment from being double-counted by overlapping listeners + cleanup.
 *
 * Callbacks are read through refs so the effect runs exactly once and never
 * re-binds listeners when a parent re-renders with new closures.
 */
export function usePageSession(onOpen: () => void, onClose: (seconds: number) => void) {
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  useEffect(() => {
    let start = Date.now();
    let flushed = false;

    onOpenRef.current();

    const flush = () => {
      if (flushed) return;
      flushed = true;
      const seconds = Math.round((Date.now() - start) / 1000);
      if (seconds > 0) onCloseRef.current(seconds);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      } else {
        // Became visible again — start a fresh active segment.
        start = Date.now();
        flushed = false;
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);

    return () => {
      flush();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
}
