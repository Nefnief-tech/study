"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Homework } from "../types";
import { uid } from "../utils";

export interface HomeworkInput {
  title: string;
  subjectId?: string;
  due?: string;
  priority: Homework["priority"];
  notes?: string;
}

interface HomeworkState {
  homeworks: Homework[];
  addHomework: (input: HomeworkInput) => void;
  updateHomework: (id: string, patch: Partial<Homework>) => void;
  toggleHomework: (id: string) => void;
  removeHomework: (id: string) => void;
  upsertOne: (homework: Homework) => void;
  removeOne: (id: string) => void;
  detachSubject: (subjectId: string) => void;
  clearAll: () => void;
}

export const useHomeworkStore = create<HomeworkState>()(
  persist(
    (set) => ({
      homeworks: [],
      addHomework: (input) =>
        set((s) => ({
          homeworks: [
            {
              ...input,
              title: input.title.trim(),
              id: uid(),
              done: false,
              createdAt: Date.now(),
            },
            ...s.homeworks,
          ],
        })),
      updateHomework: (id, patch) =>
        set((s) => ({
          homeworks: s.homeworks.map((h) =>
            h.id === id ? { ...h, ...patch, title: patch.title?.trim() ?? h.title } : h,
          ),
        })),
      toggleHomework: (id) =>
        set((s) => ({
          homeworks: s.homeworks.map((h) => (h.id === id ? { ...h, done: !h.done } : h)),
        })),
      removeHomework: (id) =>
        set((s) => ({ homeworks: s.homeworks.filter((h) => h.id !== id) })),
      upsertOne: (homework) =>
        set((s) => ({
          homeworks: [...s.homeworks.filter((h) => h.id !== homework.id), homework],
        })),
      removeOne: (id) =>
        set((s) => ({ homeworks: s.homeworks.filter((h) => h.id !== id) })),
      detachSubject: (subjectId) =>
        set((s) => ({
          homeworks: s.homeworks.map((h) =>
            h.subjectId === subjectId ? { ...h, subjectId: undefined } : h,
          ),
        })),
      clearAll: () => set({ homeworks: [] }),
    }),
    { name: "semester.homework", version: 1 },
  ),
);
