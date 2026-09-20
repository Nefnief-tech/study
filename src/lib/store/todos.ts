import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Todo } from "../types";
import { uid } from "../utils";

export interface TodoInput {
  title: string;
  notes?: string;
  due?: string;
  priority: Todo["priority"];
  subjectId?: string;
}

interface TodosState {
  todos: Todo[];
  addTodo: (input: TodoInput) => string;
  updateTodo: (id: string, patch: Partial<Todo>) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  upsertOne: (todo: Todo) => void;
  removeOne: (id: string) => void;
  detachSubject: (subjectId: string) => void;
  clearAll: () => void;
}

export const useTodosStore = create<TodosState>()(
  persist(
    (set) => ({
      todos: [],
      addTodo: (input) => {
        const todo: Todo = {
          ...input,
          title: input.title.trim(),
          id: uid(),
          done: false,
          createdAt: Date.now(),
        };
        set((s) => ({ todos: [todo, ...s.todos] }));
        return todo.id;
      },
      updateTodo: (id, patch) =>
        set((s) => ({
          todos: s.todos.map((t) =>
            t.id === id ? { ...t, ...patch, title: patch.title?.trim() ?? t.title } : t,
          ),
        })),
      toggleTodo: (id) =>
        set((s) => ({
          todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        })),
      removeTodo: (id) => set((s) => ({ todos: s.todos.filter((t) => t.id !== id) })),
  upsertOne: (todo) =>
    set((s) => ({ todos: [...s.todos.filter((t) => t.id !== todo.id), todo] })),
  removeOne: (id) => set((s) => ({ todos: s.todos.filter((t) => t.id !== id) })),
      detachSubject: (subjectId) =>
        set((s) => ({
          todos: s.todos.map((t) =>
            t.subjectId === subjectId ? { ...t, subjectId: undefined } : t,
          ),
        })),
      clearAll: () => set({ todos: [] }),
    }),
    { name: "semester.todos", version: 1 },
  ),
);
