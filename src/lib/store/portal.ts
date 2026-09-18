"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PortalPlan } from "@/lib/server/portal";

/**
 * School portal settings + the last fetched substitute plan.
 * Device-local ONLY: credentials never leave this browser (or get synced),
 * they are sent per-request to your own server for the portal login.
 */

interface PortalState {
  baseUrl: string;
  username: string;
  password: string;
  autoFetch: boolean;
  data: PortalPlan | null;
  lastFetched: number | null;
  error: string | null;

  setSettings: (s: { baseUrl: string; username: string; password: string; autoFetch: boolean }) => void;
  setData: (data: PortalPlan) => void;
  setError: (error: string | null) => void;
  clearData: () => void;
}

export const usePortalStore = create<PortalState>()(
  persist(
    (set) => ({
      baseUrl: "https://evbspar.eltern-portal.org",
      username: "",
      password: "",
      autoFetch: true,
      data: null,
      lastFetched: null,
      error: null,
      setSettings: (s) => set(s),
      setData: (data) => set({ data, lastFetched: Date.now(), error: null }),
      setError: (error) => set({ error }),
      clearData: () => set({ data: null, lastFetched: null }),
    }),
    { name: "semester.portal", version: 1 },
  ),
);
