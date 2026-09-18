"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TimetableEntry } from "../types";

interface TimetableState {
  entries: TimetableEntry[];
  updatedAt: number;
  setTimetable: (entries: TimetableEntry[]) => void;
  clear: () => void;
}

export const useTimetableStore = create<TimetableState>()(
  persist(
    (set) => ({
      entries: [],
      updatedAt: 0,
      setTimetable: (entries) => set({ entries, updatedAt: Date.now() }),
      clear: () => set({ entries: [], updatedAt: Date.now() }),
    }),
    { name: "semester.timetable", version: 1 },
  ),
);
