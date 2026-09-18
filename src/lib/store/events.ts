import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StudyEvent } from "../types";
import { uid } from "../utils";

export interface EventInput {
  title: string;
  date: string;
  time?: string;
  type: StudyEvent["type"];
  subjectId?: string;
  notes?: string;
}

interface EventsState {
  events: StudyEvent[];
  addEvent: (input: EventInput) => void;
  updateEvent: (id: string, patch: Partial<StudyEvent>) => void;
  removeEvent: (id: string) => void;
  detachSubject: (subjectId: string) => void;
  clearAll: () => void;
}

export const useEventsStore = create<EventsState>()(
  persist(
    (set) => ({
      events: [],
      addEvent: (input) =>
        set((s) => ({
          events: [...s.events, { ...input, title: input.title.trim(), id: uid() }],
        })),
      updateEvent: (id, patch) =>
        set((s) => ({
          events: s.events.map((e) =>
            e.id === id ? { ...e, ...patch, title: patch.title?.trim() ?? e.title } : e,
          ),
        })),
      removeEvent: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
      detachSubject: (subjectId) =>
        set((s) => ({
          events: s.events.map((e) =>
            e.subjectId === subjectId ? { ...e, subjectId: undefined } : e,
          ),
        })),
      clearAll: () => set({ events: [] }),
    }),
    { name: "semester.events", version: 1 },
  ),
);
