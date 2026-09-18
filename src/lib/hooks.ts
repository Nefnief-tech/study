"use client";

import { useEffect, useState } from "react";

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
