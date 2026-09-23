"use client";

import Link from "next/link";
import { useMemo } from "react";
import { addDays, format } from "date-fns";
import { BookOpen, Check, Sparkles, Trash2 } from "lucide-react";
import { useTodosStore } from "@/lib/store/todos";
import { useEventsStore } from "@/lib/store/events";
import { useSubjectsStore } from "@/lib/store/subjects";
import { useGradesStore } from "@/lib/store/grades";
import { useHomeworkStore } from "@/lib/store/homework";
import { useHydrated } from "@/lib/hooks";
import type { Homework, StudyEvent, Todo } from "@/lib/types";
import {
  cn,
  dayKeyLabel,
  dueInfo,
  findSubject,
  formatPoints,
  pointsTone,
  toDayKey,
  weightedAverage,
} from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { DueChip, EmptyState, SubjectDot } from "@/components/ui/bits";
import { Chip } from "@/components/calendar/items";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const hydrated = useHydrated();
  const todos = useTodosStore((s) => s.todos);
  const toggleTodo = useTodosStore((s) => s.toggleTodo);
  const events = useEventsStore((s) => s.events);
  const subjects = useSubjectsStore((s) => s.subjects);
  const entries = useGradesStore((s) => s.entries);

  const homeworks = useHomeworkStore((s) => s.homeworks);
  const toggleHomework = useHomeworkStore((s) => s.toggleHomework);
  const openHomework = useMemo(() => homeworks.filter((h) => !h.done), [homeworks]);

  const openTodos = useMemo(() => todos.filter((t) => !t.done), [todos]);

  const stats = useMemo(() => {
    const weekEnd = addDays(new Date(), 7).getTime();
    const isDueInWeek = (due?: string) => {
      const info = dueInfo(due);
      return !!info && info.date.getTime() <= weekEnd;
    };
    return {
      open: openTodos.length,
      dueToday: openTodos.filter((t) => dueInfo(t.due)?.isToday).length,
      week: openTodos.filter((t) => isDueInWeek(t.due)).length,
      homeworkOpen: openHomework.length,
      overall: weightedAverage(entries),
    };
  }, [openTodos, openHomework, entries]);

  const upcoming = useMemo(() => {
    const items: Array<
      | { kind: "todo"; sort: number; todo: Todo }
      | { kind: "homework"; sort: number; homework: Homework }
    > = [
      ...openTodos.map((t) => ({
        kind: "todo" as const,
        sort: dueInfo(t.due)?.date?.getTime() ?? Infinity,
        todo: t,
      })),
      ...openHomework.map((h) => ({
        kind: "homework" as const,
        sort: dueInfo(h.due)?.date?.getTime() ?? Infinity,
        homework: h,
      })),
    ];
    return items.sort((a, b) => a.sort - b.sort).slice(0, 8);
  }, [openTodos, openHomework]);

  const schedule = useMemo(() => {
    const buckets = new Map<
      string,
      Array<{ id: string; kind: "event" | "todo" | "homework"; item: unknown }>
    >();
    const start = toDayKey(new Date());
    const end = toDayKey(addDays(new Date(), 6));
    const push = (
      key: string,
      entry: { id: string; kind: "event" | "todo" | "homework"; item: unknown },
    ) => {
      if (key < start || key > end) return;
      const list = buckets.get(key) ?? [];
      list.push(entry);
      buckets.set(key, list);
    };
    for (const e of events) push(e.date, { id: e.id, kind: "event", item: e });
    for (const t of openTodos) {
      if (!t.due) continue;
      push(t.due.slice(0, 10), { id: t.id, kind: "todo", item: t });
    }
    for (const h of openHomework) {
      if (!h.due) continue;
      push(h.due.slice(0, 10), { id: h.id, kind: "homework", item: h });
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }));
  }, [events, openTodos]);

  const subjectRows = useMemo(
    () =>
      subjects.map((s) => ({
        subject: s,
        avg: weightedAverage(entries.filter((e) => e.subjectId === s.id)),
      })),
    [subjects, entries],
  );

  // hierarchy: today's reality first, then the queue, the week, numbers
  const { todayFocus, hasOverdue, restUpcoming } = useMemo(() => {
    const nowMs = new Date().getTime();
    const end = new Date(nowMs);
    end.setHours(23, 59, 59, 999);
    const endMs = end.getTime();
    const focus = upcoming
      .filter((u) => u.sort <= endMs)
      .map((u) => ({ ...u, overdue: u.sort < nowMs }));
    return {
      todayFocus: focus,
      hasOverdue: focus.some((u) => u.overdue),
      restUpcoming: upcoming.slice(focus.length),
    };
  }, [upcoming]);

  const isEmpty = todos.length === 0 && events.length === 0 && subjects.length === 0;

  if (!hydrated) return <PageSkeleton />;

  return (
    <div>
      {/* hero — compact, so today's work stays at the top */}
      <header className="mb-6">
        <p className="font-mono text-xs tracking-[0.18em] text-ink-soft uppercase">
          {format(new Date(), "EEEE, d MMMM yyyy")}
        </p>
        <h1 className="mt-2 font-display text-3xl leading-[1.05] font-semibold tracking-tight sm:text-4xl">
          {greeting()}.
          <span className="text-accent italic">
            {stats.dueToday > 0
              ? ` ${stats.dueToday} ${stats.dueToday === 1 ? "task" : "tasks"} due today.`
              : " Nothing due today."}
          </span>
        </h1>
      </header>

      {isEmpty && (
        <div className="mb-10">
          <EmptyState
            icon={<Sparkles className="size-8" />}
            title="Your desk is empty"
            hint="Add a subject, a task or a calendar entry to get started."
          />
        </div>
      )}

      {/* today — first-class section: tick off what is due right here */}
      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Today
            {hasOverdue && (
              <span className="ml-2 font-mono text-[10px] font-semibold tracking-[0.12em] text-marker uppercase">
                overdue
              </span>
            )}
          </h2>
          <Link
            href="/todos"
            className="font-mono text-[11px] tracking-wide text-ink-soft uppercase hover:text-ink"
          >
            all tasks →
          </Link>
        </div>
        {todayFocus.length === 0 ? (
          <p className="text-sm italic text-ink-soft">
            Nothing due today — the desk is calm.
          </p>
        ) : (
          <ul className="space-y-2">
            {todayFocus.map((item) => {
              const isHw = item.kind === "homework";
              const title = isHw ? item.homework.title : item.todo.title;
              const due = isHw ? item.homework.due : item.todo.due;
              const subject = findSubject(
                subjects,
                isHw ? item.homework.subjectId : item.todo.subjectId,
              );
              return (
                <li
                  key={`${item.kind}-${item.sort}`}
                  className="group flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3"
                >
                  <button
                    aria-label="mark as done"
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors",
                      item.overdue ? "border-marker/60 hover:bg-marker/10" : "border-ink/30 hover:border-accent hover:bg-accent/10",
                    )}
                    onClick={() =>
                      isHw
                        ? toggleHomework(item.homework.id)
                        : toggleTodo(item.todo.id)
                    }
                  >
                    <Check className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {isHw && <BookOpen className="size-3.5 shrink-0 text-accent" />}
                      <span className={cn("truncate", item.overdue && "text-marker")}>
                        {title}
                      </span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {subject && (
                        <span className="chip">
                          <SubjectDot color={subject.color} />
                          {subject.name}
                        </span>
                      )}
                      <DueChip due={due} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        {/* upcoming tasks */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight">Up next</h2>
            <Link
              href="/todos"
              className="font-mono text-[11px] tracking-wide text-ink-soft uppercase hover:text-ink"
            >
              all tasks →
            </Link>
          </div>
          {restUpcoming.length === 0 && todayFocus.length === 0 ? (
            <EmptyState title="All clear" hint="No open tasks or homework. Enjoy the calm." />
          ) : (
            <ul className="space-y-2">
              {restUpcoming.map((item) => {
                if (item.kind === "homework") {
                  const hw = item.homework;
                  const subject = findSubject(subjects, hw.subjectId);
                  return (
                    <li
                      key={hw.id}
                      className="group flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3"
                    >
                      <button
                        onClick={() => toggleHomework(hw.id)}
                        aria-label="Mark homework as done"
                        className="mt-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border border-ink/30 transition-colors hover:border-accent hover:bg-accent/10"
                      >
                        <Check className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <BookOpen className="size-3.5 shrink-0 text-accent" />
                          {hw.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {subject && (
                            <span className="chip">
                              <SubjectDot color={subject.color} />
                              {subject.name}
                            </span>
                          )}
                          <DueChip due={hw.due} />
                        </div>
                      </div>
                    </li>
                  );
                }
                const todo = item.todo;
                const subject = findSubject(subjects, todo.subjectId);
                return (
                  <li
                    key={todo.id}
                    className="group flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3"
                  >
                    <button
                      onClick={() => toggleTodo(todo.id)}
                      aria-label="Mark as done"
                      className="mt-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border border-ink/30 transition-colors hover:border-accent hover:bg-accent/10"
                    >
                      <Check className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{todo.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {subject && (
                          <span className="chip">
                            <SubjectDot color={subject.color} />
                            {subject.name}
                          </span>
                        )}
                        <DueChip due={todo.due} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* subject averages */}
          {subjectRows.length > 0 && (
            <div className="mt-8">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-display text-xl font-semibold tracking-tight">Subjects</h2>
                <Link
                  href="/grades"
                  className="font-mono text-[11px] tracking-wide text-ink-soft uppercase hover:text-ink"
                >
                  manage grades →
                </Link>
              </div>
              <ul className="card divide-y divide-line px-5">
                {subjectRows.map(({ subject, avg }) => {
                  const tone = avg === null ? ("neutral" as const) : pointsTone(avg);
                  return (
                    <li key={subject.id} className="flex items-center gap-3 py-3">
                      <SubjectDot color={subject.color} />
                      <span className="w-28 truncate text-sm font-medium md:w-40">
                        {subject.name}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            tone === "good" && "bg-accent",
                            tone === "ok" && "bg-info",
                            tone === "warn" && "bg-amber",
                            tone === "bad" && "bg-marker",
                            avg === null && "bg-line",
                          )}
                          style={{ width: `${avg === null ? 0 : Math.min(100, avg)}%` }}
                        />
                      </div>
                      <span className="w-14 text-right font-mono text-xs font-semibold">
                        {avg === null ? "—" : formatPoints(avg)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* next 7 days */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight">Next 7 days</h2>
            <Link
              href="/calendar"
              className="font-mono text-[11px] tracking-wide text-ink-soft uppercase hover:text-ink"
            >
              calendar →
            </Link>
          </div>
          {schedule.length === 0 ? (
            <EmptyState title="Quiet week" hint="No sessions, exams or deadlines in the next 7 days." />
          ) : (
            <div className="space-y-4">
              {schedule.map(({ key, items }) => (
                <div key={key}>
                  <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">
                    {dayKeyLabel(key)}
                  </p>
                  <div className="space-y-1.5">
                    {items.map(({ id, kind, item }) =>
                      kind === "homework" ? (
                        <div
                          key={id}
                          className="flex items-center gap-1.5 rounded-md border border-line bg-card px-1.5 py-1.5 text-xs"
                        >
                          <BookOpen className="size-3 shrink-0 text-ink-soft" />
                          <span className="truncate">{(item as Homework).title}</span>
                        </div>
                      ) : (
                        <Chip
                          key={id}
                          item={
                            kind === "event"
                              ? {
                                  kind: "event",
                                  event: item as StudyEvent,
                                  time: (item as { time?: string }).time,
                                }
                              : { kind: "todo", todo: item as Todo, time: undefined }
                          }
                          onClick={() => {
                            if (kind === "todo") toggleTodo(id);
                          }}
                          className="py-1.5 text-xs"
                        />
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* numbers — quiet, at the end */}
      <div className="card mt-10 grid grid-cols-3 divide-x divide-line">
        {(
          [
            ["tasks", String(stats.open), "/todos"],
            ["homework", String(stats.homeworkOpen), "/homework"],
            ["grade", stats.overall === null ? "—" : formatPoints(stats.overall), "/grades"],
          ] as const
        ).map(([label, value, href]) => (
          <Link
            key={label}
            href={href}
            className="group px-4 py-3 text-center transition-colors hover:bg-ink/5"
          >
            <span className="block font-display text-lg font-semibold tracking-tight">
              {value}
            </span>
            <span className="font-mono text-[9px] tracking-[0.14em] text-ink-soft uppercase">
              {label}
            </span>
          </Link>
        ))}
      </div>

      {/* danger zone */}
      <footer className="mt-14 flex justify-end border-t border-line pt-4">
        <button
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] tracking-wide text-ink-soft/70 uppercase transition-colors hover:text-marker"
          onClick={() => {
            if (!window.confirm("Delete all tasks, grades, events and subjects? This cannot be undone."))
              return;
            useTodosStore.getState().clearAll();
            useGradesStore.getState().clearAll();
            useEventsStore.getState().clearAll();
            useSubjectsStore.getState().clearAll();
            useHomeworkStore.getState().clearAll();
          }}
        >
          <Trash2 className="size-3" /> clear all data
        </button>
      </footer>
    </div>
  );
}
