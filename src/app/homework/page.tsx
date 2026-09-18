"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, Pencil, Plus, Trash2 } from "lucide-react";
import type { Homework } from "@/lib/types";
import { useHomeworkStore } from "@/lib/store/homework";
import { useSubjectsStore } from "@/lib/store/subjects";
import { useHydrated } from "@/lib/hooks";
import { cn, dueInfo, findSubject, PRIORITY_ORDER } from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { DueChip, EmptyState, PriorityBadge, SubjectTag } from "@/components/ui/bits";
import HomeworkFormModal from "@/components/homework/HomeworkFormModal";

type StatusFilter = "open" | "done" | "all";

export default function HomeworkPage() {
  const hydrated = useHydrated();
  const homeworks = useHomeworkStore((s) => s.homeworks);
  const subjects = useSubjectsStore((s) => s.subjects);
  const toggleHomework = useHomeworkStore((s) => s.toggleHomework);
  const removeHomework = useHomeworkStore((s) => s.removeHomework);

  const [status, setStatus] = useState<StatusFilter>("open");
  const [subjectFilter, setSubjectFilter] = useState<string | "all">("all");
  const [modal, setModal] = useState<{ open: boolean; homework?: Homework }>({ open: false });

  const visible = useMemo(() => {
    let list = homeworks;
    if (status !== "all") list = list.filter((h) => (status === "done" ? h.done : !h.done));
    if (subjectFilter !== "all") list = list.filter((h) => h.subjectId === subjectFilter);
    return [...list].sort((a, b) => {
      const da = dueInfo(a.due)?.date?.getTime() ?? Infinity;
      const db = dueInfo(b.due)?.date?.getTime() ?? Infinity;
      if (da !== db) return da - db;
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt - a.createdAt;
    });
  }, [homeworks, status, subjectFilter]);

  const openCount = homeworks.filter((h) => !h.done).length;

  if (!hydrated) return <PageSkeleton />;

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Homework</h1>
          <p className="mt-1 font-mono text-xs tracking-wide text-ink-soft">
            {openCount} open · {homeworks.length - openCount} done
          </p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <Plus className="size-4" /> New homework
        </button>
      </header>

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
              <span className="inline-block size-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title={status === "done" ? "Nothing completed yet" : "No homework here"}
          hint={
            status === "done"
              ? "Finished homework will collect here."
              : "Add what your teachers assigned — with a due date and subject, it shows up on the calendar too."
          }
          action={
            <button className="btn-primary" onClick={() => setModal({ open: true })}>
              <Plus className="size-4" /> New homework
            </button>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((hw) => {
            const subject = findSubject(subjects, hw.subjectId);
            return (
              <li
                key={hw.id}
                className="group flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3 transition-colors hover:border-ink/20"
              >
                <button
                  onClick={() => toggleHomework(hw.id)}
                  aria-label={hw.done ? "Mark as open" : "Mark as done"}
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors",
                    hw.done
                      ? "border-accent bg-accent text-paper"
                      : "border-ink/30 hover:border-accent hover:bg-accent/10",
                  )}
                >
                  {hw.done && <Check className="size-3" strokeWidth={3} />}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm leading-snug font-medium",
                      hw.done && "text-ink-soft line-through",
                    )}
                  >
                    {hw.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {subject && <SubjectTag name={subject.name} color={subject.color} />}
                    {hw.due && <DueChip due={hw.due} done={hw.done} />}
                    <PriorityBadge priority={hw.priority} />
                  </div>
                  {hw.notes && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-ink-soft">{hw.notes}</p>
                  )}
                </div>

                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                  <button
                    className="btn-icon"
                    aria-label="Edit homework"
                    onClick={() => setModal({ open: true, homework: hw })}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    className="btn-icon hover:text-marker"
                    aria-label="Delete homework"
                    onClick={() => removeHomework(hw.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <HomeworkFormModal
        open={modal.open}
        homework={modal.homework}
        onClose={() => setModal({ open: false })}
      />
    </div>
  );
}
