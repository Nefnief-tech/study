"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GradeEntry } from "../types";
import { percentToPoints, uid } from "../utils";

/** converts pre-Punkte entries (score/max) and clamps Punkte entries to 0–15 */
export function normalizeGradeEntries(raw: unknown): GradeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null && "id" in e)
    .map((e) => ({
      id: String(e.id),
      subjectId: typeof e.subjectId === "string" ? e.subjectId : undefined,
      title: String(e.title ?? ""),
      points:
        typeof e.points === "number"
          ? Math.max(0, Math.min(15, e.points))
          : percentToPoints(Number(e.max) > 0 ? (Number(e.score) / Number(e.max)) * 100 : 0),
      weight: Number(e.weight ?? 1) || 1,
      date: typeof e.date === "string" ? e.date : undefined,
    })) satisfies GradeEntry[];
}

export interface GradeInput {
  subjectId: string;
  title: string;
  points: number;
  weight: number;
  date?: string;
}

interface GradesState {
  entries: GradeEntry[];
  addEntry: (input: GradeInput) => void;
  updateEntry: (id: string, patch: Partial<GradeEntry>) => void;
  removeEntry: (id: string) => void;
  /** removes every entry belonging to the subject (cascade on subject delete) */
  removeSubject: (subjectId: string) => void;
  clearAll: () => void;
}

export const useGradesStore = create<GradesState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (input) =>
        set((s) => ({ entries: [...s.entries, { ...input, title: input.title.trim(), id: uid() }] })),
      updateEntry: (id, patch) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id ? { ...e, ...patch, title: patch.title?.trim() ?? e.title } : e,
          ),
        })),
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      removeSubject: (subjectId) =>
        set((s) => ({ entries: s.entries.filter((e) => e.subjectId !== subjectId) })),
      clearAll: () => set({ entries: [] }),
    }),
    {
      name: "semester.grades",
      version: 2,
      // v1 stored score/max entries — convert them to the Punkte system
      migrate: (state) => {
        const s = state as { entries?: unknown };
        return { ...s, entries: normalizeGradeEntries(s.entries) };
      },
    },
  ),
);
