"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Persisted zustand stores rehydrate after SSR, so any component that reads
 * them must only render real content once mounted — otherwise React
 * hydration mismatches. Pages gate on this hook and render a skeleton.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/**
 * Auto-save helper: runs `fn` at most once per `ms` after the last call.
 * Call `cancel()` when the edited entity goes away (modal closed) so no
 * stray timer fires afterwards.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
) {
  const fnRef = useRef(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    fnRef.current = fn;
  });

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const run = useCallback(
    (...args: Args) => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        fnRef.current(...args);
      }, ms);
    },
    [cancel, ms],
  );

  useEffect(() => cancel, [cancel]);

  // stable identity so consumers can safely use it in effect deps
  return useMemo(() => ({ run, cancel }), [run, cancel]);
}
