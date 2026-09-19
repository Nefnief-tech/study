"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "@/lib/auth/appwrite";

export type SyncStatus = "unconfigured" | "loading" | "signed-out" | "signed-in";

interface AuthState {
  user: AuthUser | null;
  status: SyncStatus;
  syncing: boolean;
  online: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;
  setAuth: (user: AuthUser | null, status: SyncStatus) => void;
  setSyncing: (syncing: boolean) => void;
  setSynced: (at: number) => void;
  setSyncError: (message: string) => void;
  setOnline: (online: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: "unconfigured",
  syncing: false,
  online: true,
  lastSyncedAt: null,
  syncError: null,
  setAuth: (user, status) => set({ user, status, syncError: null }),
  setSyncing: (syncing) => set({ syncing }),
  setSynced: (lastSyncedAt) => set({ lastSyncedAt, syncing: false, syncError: null }),
  setSyncError: (syncError) => set({ syncError, syncing: false }),
  setOnline: (online) => set({ online }),
}));

/**
 * Tracks unsynced local edits per store key. A key is "dirty" from the moment
 * it changes locally until its cloud push succeeds — on page load the cloud
 * snapshot wins, unless the local copy holds edits that never made it up.
 */
interface SyncMetaState {
  dirtyAt: Record<string, number>;
  /** keys whose cloud state this device has observed — pushes require this */
  loaded: string[];
  /** last-synced content digests for row collections: {store: {rowId: hash}} */
  rowDigests: Record<string, Record<string, string>>;
  markDirty: (key: string, at: number) => void;
  markLoaded: (key: string) => void;
  isLoaded: (key: string) => boolean;
  setRowDigests: (store: string, digests: Record<string, string>) => void;
  clearDirty: (key: string) => void;
}

export const useSyncMetaStore = create<SyncMetaState>()(
  persist(
    (set, get) => ({
      dirtyAt: {},
      loaded: [],
      rowDigests: {},
      markDirty: (key, at) => set((s) => ({ dirtyAt: { ...s.dirtyAt, [key]: at } })),
      markLoaded: (key) =>
        set((s) => (s.loaded.includes(key) ? s : { loaded: [...s.loaded, key] })),
      isLoaded: (key) => get().loaded.includes(key),
      setRowDigests: (store, digests) =>
        set((s) => ({ rowDigests: { ...s.rowDigests, [store]: digests } })),
      clearDirty: (key) =>
        set((s) => {
          const dirtyAt = { ...s.dirtyAt };
          delete dirtyAt[key];
          return { dirtyAt };
        }),
    }),
    {
      name: "semester.syncmeta",
      version: 4,
      // v3 → v4: row collections start with fresh digests (first cycle uploads)
      migrate: (state) => ({ ...(state as object), loaded: [], rowDigests: {} }),
    },
  ),
);
