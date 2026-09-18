"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { BookOpen, CalendarPlus, ChevronLeft, ChevronRight, Flag, GraduationCap, Plus } from "lucide-react";
import type { StudyEvent } from "@/lib/types";
import { useTodosStore } from "@/lib/store/todos";
import { cn, toDayKey } from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { useHydrated } from "@/lib/hooks";
import EventFormModal from "@/components/calendar/EventFormModal";
import { Chip, TYPE_ICONS, TYPE_LABELS, useCalendarRange } from "@/components/calendar/items";

type View = "month" | "week";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  const hydrated = useHydrated();
  const toggleTodo = useTodosStore((s) => s.toggleTodo);
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [modal, setModal] = useState<{ open: boolean; date?: string; event?: StudyEvent }>({
    open: false,
  });

  const { events, todos, itemsFor } = useCalendarRange(cursor, cursor);

  // month grid: 6 weeks starting Monday, covering the whole displayed month
  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  // week view: Monday..Sunday of the cursor's week
  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const move = (dir: -1 | 1) =>
    setCursor((c) => (view === "month" ? addMonths(c, dir) : addDays(c, dir * 7)));

  const rangeLabel =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : `${format(weekDays[0], "d MMM")} – ${format(weekDays[6], "d MMM yyyy")}`;

  if (!hydrated) return <PageSkeleton />;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight capitalize">
            {rangeLabel}
          </h1>
          <p className="mt-1 font-mono text-xs tracking-wide text-ink-soft">
            deadlines, sessions & task due dates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-line bg-card">
            <button className="btn-icon rounded-r-none" onClick={() => move(-1)} aria-label="Previous">
              <ChevronLeft className="size-4" />
            </button>
            <button
              className="cursor-pointer border-x border-line px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase hover:bg-ink/5"
              onClick={() => setCursor(new Date())}
            >
              Today
            </button>
            <button className="btn-icon rounded-l-none" onClick={() => move(1)} aria-label="Next">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="flex rounded-lg border border-line bg-card p-0.5">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase transition-colors",
                  view === v ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={() => setModal({ open: true })}>
            <Plus className="size-4" /> New entry
          </button>
        </div>
      </header>

      {/* legend */}
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-wide text-ink-soft uppercase">
        {(Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>).map((t) => {
          const Icon = TYPE_ICONS[t];
          return (
            <span key={t} className="inline-flex items-center gap-1">
              <Icon className="size-3" /> {TYPE_LABELS[t]}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1">
          <Flag className="size-3" /> due tasks appear automatically
        </span>
      </div>

      {view === "month" ? (
        <div>
          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="py-2 text-center font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase"
              >
                <span className="max-sm:hidden">{d}</span>
                <span className="sm:hidden">{d[0]}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day, i) => {
              const inMonth = isSameMonth(day, cursor);
              const items = itemsFor(day);
              const shown = items.slice(0, 3);
              const hidden = items.length - shown.length;
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => setModal({ open: true, date: toDayKey(day) })}
                  className={cn(
                    "min-h-20 cursor-pointer border-b border-r border-line/70 p-1.5 transition-colors hover:bg-accent/[0.04] md:min-h-28 [&:nth-child(7n)]:border-r-0",
                    !inMonth && "bg-paper-deep/50 text-ink-soft",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <span
                      className={cn(
                        "font-mono text-[11px]",
                        isToday(day) &&
                          "grid size-5 place-items-center rounded-full bg-accent font-semibold text-paper",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {shown.map((item) => (
                      <Chip
                        key={item.kind === "event" ? item.event.id : item.todo.id}
                        item={item}
                        className="max-md:hidden"
                        onClick={() => {
                          if (item.kind === "event") setModal({ open: true, event: item.event });
                          else toggleTodo(item.todo.id);
                        }}
                      />
                    ))}
                    {hidden > 0 && (
                      <span className="block px-1 font-mono text-[10px] text-ink-soft">
                        +{hidden} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-7">
          {weekDays.map((day) => {
            const items = itemsFor(day);
            return (
              <div
                key={day.toISOString()}
                className="flex min-h-40 flex-col rounded-xl border border-line bg-card"
                onClick={() => setModal({ open: true, date: toDayKey(day) })}
              >
                <div
                  className={cn(
                    "flex items-center justify-between rounded-t-xl border-b border-line px-3 py-2",
                    isToday(day) && "bg-accent-soft",
                  )}
                >
                  <span className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">
                    {format(day, "EEE")}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs",
                      isToday(day) && "grid size-5 place-items-center rounded-full bg-accent font-semibold text-paper",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>
                <div className="flex-1 space-y-1.5 p-2">
                  {items.map((item) => (
                    <Chip
                      key={item.kind === "event" ? item.event.id : item.todo.id}
                      item={item}
                      onClick={() => {
                        if (item.kind === "event") setModal({ open: true, event: item.event });
                        else toggleTodo(item.todo.id);
                      }}
                    />
                  ))}
                  {items.length === 0 && (
                    <p className="px-1 pt-2 text-center font-mono text-[10px] text-ink-soft/70">
                      free
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* tap target for mobile month cells */}
      {view === "month" && (
        <button
          className="btn-ghost mx-auto mt-6 md:hidden"
          onClick={() => setModal({ open: true })}
        >
          <CalendarPlus className="size-4" /> Tap a day to add an entry
        </button>
      )}

      <div className="mt-6 flex items-center gap-1.5 text-xs text-ink-soft">
        <BookOpen className="size-3.5" />
        Click a day to schedule · click an entry to edit or tick it off
      </div>

      <EventFormModal
        open={modal.open}
        date={modal.date}
        event={modal.event}
        onClose={() => setModal({ open: false })}
      />
    </div>
  );
}
