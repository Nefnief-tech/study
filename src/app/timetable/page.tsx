"use client";

import { useMemo, useState } from "react";
import { Eraser, Table2, Upload } from "lucide-react";
import type { TimetableEntry } from "@/lib/types";
import { useTimetableStore } from "@/lib/store/timetable";
import { useSubjectsStore } from "@/lib/store/subjects";
import { useHydrated } from "@/lib/hooks";
import {
  DAY_ORDER,
  EXAMPLE_TIMETABLE,
  parseTimetable,
  timetableToJson,
} from "@/lib/timetable";
import { cn, PALETTE } from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { EmptyState, SubjectDot } from "@/components/ui/bits";

function subjectColor(name: string, names: Map<string, string>) {
  return names.get(name.toLowerCase()) ?? PALETTE[name.length % PALETTE.length];
}

export default function TimetablePage() {
  const hydrated = useHydrated();
  const entries = useTimetableStore((s) => s.entries);
  const setTimetable = useTimetableStore((s) => s.setTimetable);
  const clear = useTimetableStore((s) => s.clear);
  const subjects = useSubjectsStore((s) => s.subjects);

  const [panelOpen, setPanelOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const subjectColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of subjects) map.set(s.name.toLowerCase(), s.color);
    return map;
  }, [subjects]);

  const days = useMemo(
    () => DAY_ORDER.filter((d) => entries.some((e) => e.day === d)),
    [entries],
  );
  const periods = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) set.add(e.period);
    return [...set].sort((a, b) => a - b);
  }, [entries]);

  const cell = (day: string, period: number) =>
    entries.filter((e) => e.day === day && e.period === period);

  const periodTime = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of entries) if (e.time && !map.has(e.period)) map.set(e.period, e.time);
    return map;
  }, [entries]);

  const todayCol = DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  const load = (text: string) => {
    setError("");
    setWarnings([]);
    try {
      const { entries: parsed, warnings: warns } = parseTimetable(text);
      setTimetable(parsed);
      setWarnings(warns);
      if (warns.length === 0) setPanelOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!hydrated) return <PageSkeleton />;

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-4xl font-semibold tracking-tight">
            Timetable
            <Table2 className="size-5 text-accent" />
          </h1>
          <p className="mt-1 font-mono text-xs tracking-wide text-ink-soft">
            paste your timetable as JSON — formatted automatically
          </p>
        </div>
        {entries.length > 0 && (
          <div className="flex gap-2">
            <button
              className="btn-ghost"
              onClick={() => {
                setRaw(timetableToJson(entries));
                setPanelOpen(true);
              }}
            >
              <Upload className="size-4" /> Edit JSON
            </button>
            <button
              className="btn-ghost hover:border-marker/40 hover:text-marker"
              onClick={() => window.confirm("Clear the whole timetable?") && clear()}
            >
              <Eraser className="size-4" /> Clear
            </button>
          </div>
        )}
      </header>

      {/* import panel */}
      {(panelOpen || entries.length === 0) && (
        <div className="card mb-8 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Paste timetable JSON
            </h2>
            <button
              className="btn-ghost"
              onClick={() => {
                setRaw(EXAMPLE_TIMETABLE);
                setError("");
              }}
            >
              Use example
            </button>
          </div>
          <textarea
            className="field min-h-48 resize-y font-mono text-xs leading-relaxed"
            spellCheck={false}
            placeholder='[{ "day": "mon", "period": 1, "subject": "Mathematics", "room": "B102" }, …]'
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={() => load(raw)}>
              <Upload className="size-4" /> Format timetable
            </button>
            <p className="font-mono text-[10px] leading-relaxed text-ink-soft">
              each entry: day · period · subject — optional: time · teacher · room.
              days: mon–sun (EN or DE).
            </p>
          </div>
          {error && <p className="mt-3 text-sm text-marker">{error}</p>}
          {warnings.length > 0 && (
            <ul className="mt-3 space-y-0.5 font-mono text-[11px] text-amber">
              {warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* formatted grid */}
      {entries.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-20 border-b border-r border-line bg-card px-2 py-2.5 font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">
                  Pd
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={cn(
                      "border-b border-line px-3 py-2.5 font-display text-base font-semibold tracking-tight",
                      d === todayCol && "bg-accent-soft text-accent",
                    )}
                  >
                    {d}
                    {d === todayCol && (
                      <span className="ml-2 font-mono text-[9px] tracking-[0.14em] uppercase">
                        today
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p} className="align-top">
                  <td className="sticky left-0 z-10 border-b border-r border-line bg-card px-2 py-2 text-center">
                    <div className="font-mono text-sm font-semibold">{p}</div>
                    {periodTime.get(p) && (
                      <div className="font-mono text-[9px] leading-tight text-ink-soft">
                        {periodTime.get(p)!.split(" - ")[0]}
                      </div>
                    )}
                  </td>
                  {days.map((d) => {
                    const items = cell(d, p);
                    return (
                      <td
                        key={d}
                        className={cn(
                          "border-b border-line px-2 py-2 align-top",
                          d === todayCol && "bg-accent/[0.06]",
                        )}
                      >
                        {items.length === 0 ? (
                          <span className="text-ink-soft/40">—</span>
                        ) : (
                          <div className="space-y-1.5">
                            {items.map((e, i) => (
                              <div key={i}>
                                <div className="flex items-center gap-1.5">
                                  <SubjectDot color={subjectColor(e.subject, subjectColors)} />
                                  <span className="text-xs leading-tight font-semibold">
                                    {e.subject}
                                  </span>
                                </div>
                                <div className="mt-0.5 font-mono text-[9px] leading-tight text-ink-soft">
                                  {e.time && <div>{e.time}</div>}
                                  {e.teacher && <div>{e.teacher}</div>}
                                  {e.room && <div>room {e.room}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !panelOpen && (
          <EmptyState
            icon={<Table2 className="size-8" />}
            title="No timetable yet"
            hint="Paste your school's timetable as JSON and it becomes a clean weekly grid. The example shows the exact format."
            action={
              <button className="btn-primary" onClick={() => setPanelOpen(true)}>
                <Upload className="size-4" /> Paste JSON
              </button>
            }
          />
        )
      )}
    </div>
  );
}
