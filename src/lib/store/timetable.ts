"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TimetableEntry } from "../types";
import { hashId } from "../utils";

/** stable cloud row id for an entry — derived from its content, so both
 * clients derive the same id without coordinating (entries have no id) */
export const timetableRowId = (e: TimetableEntry) =>
  hashId([e.day, e.period, e.time ?? "", e.subject, e.teacher ?? "", e.room ?? ""].join("|"));

interface TimetableState {
  entries: TimetableEntry[];
  updatedAt: number;
  setTimetable: (entries: TimetableEntry[]) => void;
  /** structured sync: replace with rows pulled from the cloud */
  replaceEntries: (entries: TimetableEntry[]) => void;
  upsertEntry: (entry: TimetableEntry) => void;
  removeEntry: (rowId: string) => void;
  clear: () => void;
}

export const useTimetableStore = create<TimetableState>()(
  persist(
    (set) => ({
      entries: [],
      updatedAt: 0,
      setTimetable: (entries) => set({ entries, updatedAt: Date.now() }),
      replaceEntries: (entries) => set({ entries }),
      upsertEntry: (entry) =>
        set((s) => {
          const rowId = timetableRowId(entry);
          return { entries: [...s.entries.filter((e) => timetableRowId(e) !== rowId), entry] };
        }),
      removeEntry: (rowId) =>
        set((s) => ({ entries: s.entries.filter((e) => timetableRowId(e) !== rowId) })),
      clear: () => set({ entries: [], updatedAt: Date.now() }),
    }),
    { name: "semester.timetable", version: 1 },
  ),
);
