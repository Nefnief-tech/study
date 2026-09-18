"use client";

import { BookOpen, CalendarDays, Check, Flag, GraduationCap, type LucideIcon } from "lucide-react";
import type { EventType, StudyEvent, Todo } from "@/lib/types";
import { useSubjectsStore } from "@/lib/store/subjects";
import { useEventsStore } from "@/lib/store/events";
import { useTodosStore } from "@/lib/store/todos";
import { cn, findSubject, toDayKey } from "@/lib/utils";

export const TYPE_ICONS: Record<EventType, LucideIcon> = {
  study: BookOpen,
  deadline: Flag,
  exam: GraduationCap,
  event: CalendarDays,
};

export const TYPE_LABELS: Record<EventType, string> = {
  study: "Study session",
  deadline: "Deadline",
  exam: "Exam",
  event: "Event",
};

export type CalendarItem =
  | { kind: "event"; event: StudyEvent; time?: string }
  | { kind: "todo"; todo: Todo; time?: string };

/** events + todo due dates for one yyyy-MM-dd day key, sorted by time */
export function itemsForDay(
  events: StudyEvent[],
  todos: Todo[],
  dayKey: string,
): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const e of events) {
    if (e.date !== dayKey) continue;
    items.push({ kind: "event", event: e, time: e.time });
  }
  for (const t of todos) {
    if (!t.due || !t.due.startsWith(dayKey)) continue;
    const time = t.due.includes("T") ? t.due.split("T")[1] : undefined;
    items.push({ kind: "todo", todo: t, time });
  }
  return items.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
}

export function Chip({
  item,
  onClick,
  className,
}: {
  item: CalendarItem;
  onClick: () => void;
  className?: string;
}) {
  const subjects = useSubjectsStore((s) => s.subjects);
  const color =
    item.kind === "event"
      ? (findSubject(subjects, item.event.subjectId)?.color ?? "#756e60")
      : (findSubject(subjects, item.todo.subjectId)?.color ?? "#756e60");

  if (item.kind === "event") {
    const Icon = TYPE_ICONS[item.event.type];
    return (
      <button
        onClick={onClick}
        title={`${TYPE_LABELS[item.event.type]} — ${item.event.title}`}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border border-line bg-card px-1.5 py-1 text-left text-[11px] leading-tight transition-colors hover:border-ink/30",
          className,
        )}
      >
        <span className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <Icon className="size-3 shrink-0 text-ink-soft" />
        {item.time && <span className="shrink-0 font-mono text-[10px] text-ink-soft">{item.time}</span>}
        <span className="truncate">{item.event.title}</span>
      </button>
    );
  }

  const { todo } = item;
  return (
    <button
      onClick={onClick}
      title={todo.done ? "Mark as open" : "Mark as done"}
      className={cn(
        "flex w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border border-line bg-card px-1.5 py-1 text-left text-[11px] leading-tight transition-colors hover:border-ink/30",
        className,
      )}
    >
      <span className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span
        className={cn(
          "grid size-3 shrink-0 place-items-center rounded-full border",
          todo.done ? "border-accent bg-accent text-paper" : "border-ink/30",
        )}
      >
        {todo.done && <Check className="size-2" strokeWidth={4} />}
      </span>
      {item.time && <span className="shrink-0 font-mono text-[10px] text-ink-soft">{item.time}</span>}
      <span className={cn("truncate", todo.done && "text-ink-soft line-through")}>{todo.title}</span>
    </button>
  );
}

/** convenience hook combining the stores for a whole visible range */
export function useCalendarRange(from: Date, to: Date) {
  const events = useEventsStore((s) => s.events);
  const todos = useTodosStore((s) => s.todos);
  return { events, todos, itemsFor: (d: Date) => itemsForDay(events, todos, toDayKey(d)) };
}
