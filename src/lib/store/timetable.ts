"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TimetableEntry } from "../types";

interface TimetableState {
  entries: TimetableEntry[];
  updatedAt: number;
  setTimetable: (entries: TimetableEntry[]) => void;
  /** structured sync: replace with rows pulled from the cloud */
  replaceEntries: (entries: TimetableEntry[]) => void;
  clear: () => void;
}

export const useTimetableStore = create<TimetableState>()(
  persist(
    (set) => ({
      entries: [],
      updatedAt: 0,
      setTimetable: (entries) => set({ entries, updatedAt: Date.now() }),
      replaceEntries: (entries) => set({ entries }),
      clear: () => set({ entries: [], updatedAt: Date.now() }),
    }),
    { name: "semester.timetable", version: 1 },
  ),
);
