import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Subject } from "../types";
import { PALETTE, uid } from "../utils";
import { useTodosStore } from "./todos";
import { useGradesStore } from "./grades";
import { useEventsStore } from "./events";
import { useHomeworkStore } from "./homework";

interface SubjectsState {
  subjects: Subject[];
  addSubject: (input: { name: string; color?: string }) => Subject;
  updateSubject: (id: string, patch: Partial<Omit<Subject, "id">>) => void;
  /** removes the subject and detaches/deletes it everywhere (todos, grades, events) */
  removeSubject: (id: string) => void;
  clearAll: () => void;
}

export const useSubjectsStore = create<SubjectsState>()(
  persist(
    (set, get) => ({
      subjects: [],
      addSubject: ({ name, color }) => {
        const subject: Subject = {
          id: uid(),
          name: name.trim(),
          color: color ?? PALETTE[get().subjects.length % PALETTE.length],
        };
        set((s) => ({ subjects: [...s.subjects, subject] }));
        return subject;
      },
      updateSubject: (id, patch) =>
        set((s) => ({
          subjects: s.subjects.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      removeSubject: (id) => {
        set((s) => ({ subjects: s.subjects.filter((x) => x.id !== id) }));
        useTodosStore.getState().detachSubject(id);
        useGradesStore.getState().removeSubject(id);
        useEventsStore.getState().detachSubject(id);
        useHomeworkStore.getState().detachSubject(id);
      },
      clearAll: () => set({ subjects: [] }),
    }),
    { name: "semester.subjects", version: 1 },
  ),
);
