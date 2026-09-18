"use client";

import { useMemo, useState } from "react";
import { Check, Inbox, Pencil, Plus, Trash2 } from "lucide-react";
import { useTodosStore } from "@/lib/store/todos";
import { useSubjectsStore } from "@/lib/store/subjects";
import { useHydrated } from "@/lib/hooks";
import type { Todo } from "@/lib/types";
import { cn, dueInfo, findSubject, PRIORITY_ORDER } from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { DueChip, EmptyState, PriorityBadge, SubjectTag } from "@/components/ui/bits";
import TodoFormModal from "@/components/todos/TodoFormModal";

type StatusFilter = "open" | "done" | "all";
type SortMode = "due" | "priority";

export default function TodosPage() {
  const hydrated = useHydrated();
  const todos = useTodosStore((s) => s.todos);
  const subjects = useSubjectsStore((s) => s.subjects);
  const toggleTodo = useTodosStore((s) => s.toggleTodo);
  const removeTodo = useTodosStore((s) => s.removeTodo);

  const [status, setStatus] = useState<StatusFilter>("open");
  const [subjectFilter, setSubjectFilter] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortMode>("due");
  const [modal, setModal] = useState<{ open: boolean; todo?: Todo }>({ open: false });

  const visible = useMemo(() => {
    let list = todos;
    if (status !== "all") list = list.filter((t) => (status === "done" ? t.done : !t.done));
    if (subjectFilter !== "all") list = list.filter((t) => t.subjectId === subjectFilter);
    return [...list].sort((a, b) => {
      if (sort === "priority") {
        const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (p !== 0) return p;
      }
      const da = dueInfo(a.due)?.date?.getTime() ?? Infinity;
      const db = dueInfo(b.due)?.date?.getTime() ?? Infinity;
      if (da !== db) return da - db;
      return a.createdAt - b.createdAt;
    });
  }, [todos, status, subjectFilter, sort]);

  const openCount = todos.filter((t) => !t.done).length;

  if (!hydrated) return <PageSkeleton />;

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 font-mono text-xs tracking-wide text-ink-soft">
            {openCount} open · {todos.length - openCount} done
          </p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <Plus className="size-4" /> New task
        </button>
      </header>

      {/* filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-line bg-card p-0.5">
          {(["open", "done", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors",
                status === s ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSubjectFilter("all")}
            className={cn(
              "chip cursor-pointer px-2.5 py-1 transition-colors",
              subjectFilter === "all" ? "border-ink bg-ink text-paper" : "hover:border-ink/30",
            )}
          >
            All subjects
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setSubjectFilter(subjectFilter === s.id ? "all" : s.id)}
              className={cn(
                "chip cursor-pointer px-2.5 py-1 transition-colors",
                subjectFilter === s.id ? "border-ink bg-ink text-paper" : "hover:border-ink/30",
              )}
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </button>
          ))}
        </div>

        <select
          className="field ml-auto w-auto cursor-pointer py-1.5 font-mono text-[11px] uppercase"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          aria-label="Sort tasks"
        >
          <option value="due">sort · due date</option>
          <option value="priority">sort · priority</option>
        </select>
      </div>

      {/* list */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-8" />}
          title={status === "done" ? "Nothing completed yet" : "No tasks here"}
          hint={
            status === "done"
              ? "Finished tasks will collect here."
              : "Add a task with a due date, priority and subject — it will also show up on the calendar."
          }
          action={
            <button className="btn-primary" onClick={() => setModal({ open: true })}>
              <Plus className="size-4" /> New task
            </button>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((todo) => {
            const subject = findSubject(subjects, todo.subjectId);
            const info = dueInfo(todo.due);
            return (
              <li
                key={todo.id}
                className="group flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3 transition-colors hover:border-ink/20"
              >
                <button
                  onClick={() => toggleTodo(todo.id)}
                  aria-label={todo.done ? "Mark as open" : "Mark as done"}
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors",
                    todo.done
                      ? "border-accent bg-accent text-paper"
                      : "border-ink/30 hover:border-accent hover:bg-accent/10",
                  )}
                >
                  {todo.done && <Check className="size-3" strokeWidth={3} />}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm leading-snug font-medium",
                      todo.done && "text-ink-soft line-through",
                    )}
                  >
                    {todo.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {subject && <SubjectTag name={subject.name} color={subject.color} />}
                    {info && <DueChip due={todo.due} done={todo.done} />}
                    <PriorityBadge priority={todo.priority} />
                  </div>
                  {todo.notes && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-ink-soft">{todo.notes}</p>
                  )}
                </div>

                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                  <button
                    className="btn-icon"
                    aria-label="Edit task"
                    onClick={() => setModal({ open: true, todo })}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    className="btn-icon hover:text-marker"
                    aria-label="Delete task"
                    onClick={() => removeTodo(todo.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TodoFormModal
        open={modal.open}
        todo={modal.todo}
        onClose={() => setModal({ open: false })}
      />
    </div>
  );
}
