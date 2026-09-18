"use client";

import { useEffect, useMemo, useState } from "react";
import { Eraser, RefreshCcw, Table2, Upload } from "lucide-react";
import type { PortalSub } from "@/lib/server/portal";
import type { TimetableEntry } from "@/lib/types";
import { useTimetableStore } from "@/lib/store/timetable";
import { usePortalStore } from "@/lib/store/portal";
import { useSubjectsStore } from "@/lib/store/subjects";
import { useAuthStore } from "@/lib/store/auth";
import { useHydrated } from "@/lib/hooks";
import {
  DAY_ORDER,
  EXAMPLE_TIMETABLE,
  parseTimetable,
  timetableToJson,
} from "@/lib/timetable";
import { cn, PALETTE } from "@/lib/utils";
import { getAuthHeaders } from "@/lib/auth/appwrite";
import { mirrorPortal } from "@/lib/auth/sync";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { EmptyState, SubjectDot } from "@/components/ui/bits";

const PORTAL_WEEKDAY: Record<string, string> = {
  Mo: "Mon",
  Di: "Tue",
  Mi: "Wed",
  Do: "Thu",
  Fr: "Fri",
  Sa: "Sat",
  So: "Sun",
};

function subjectColor(name: string, names: Map<string, string>) {
  return names.get(name.toLowerCase()) ?? PALETTE[name.length % PALETTE.length];
}

export default function TimetablePage() {
  const hydrated = useHydrated();
  const entries = useTimetableStore((s) => s.entries);
  const setTimetable = useTimetableStore((s) => s.setTimetable);
  const clear = useTimetableStore((s) => s.clear);
  const subjects = useSubjectsStore((s) => s.subjects);

  const portal = usePortalStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);

  const signedIn = useAuthStore((s) => s.status) === "signed-in";

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

  const periodTime = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of entries) if (e.time && !map.has(e.period)) map.set(e.period, e.time);
    return map;
  }, [entries]);

  const todayCol = DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  /** substitute-plan entries that affect one timetable cell (day + period + subject).
   *  course codes are CASE-SENSITIVE: 2ph1 ≠ 2PH1. A sub matches a lesson when
   *  the course code equals the lesson's subject OR its teacher — the timetable
   *  JSON carries the course code in the teacher field. */
  const relevantSubs: PortalSub[] = portal.data
    ? portal.data.days.flatMap((d) => d.entries).filter((s) =>
        portal.data!.courses.some((c) => c.trim() === s.course.trim()))
    : [];

  const cellSubsFor = (day: string, period: number, items: TimetableEntry[]) =>
    relevantSubs.filter(
      (s) =>
        PORTAL_WEEKDAY[s.weekday] === day &&
        parseInt(s.period, 10) === period &&
        items.some(
          (e) => e.subject.trim() === s.course.trim() || e.teacher?.trim() === s.course.trim(),
        ),
    );

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

  const fetchNow = async () => {
    if (fetching) return;
    setFetching(true);
    portal.setError(null);
    try {
      const res = await fetch("/api/portal/fetch", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify({
          baseUrl: portal.baseUrl,
          username: portal.username,
          password: portal.password,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | PortalPlanJson
        | { error?: string; detail?: string }
        | null;
      if (!res.ok || !json || !("days" in json)) {
        const code = json && "error" in json ? json.error : "portal_unreachable";
        portal.setError(
          code === "portal_auth"
            ? "Portal rejected the login — check portal URL, email and password."
            : code === "auth_required"
              ? "Sign in first (sidebar)."
              : code === "missing_settings"
                ? "Fill in portal URL, email and password below."
                : (json && "detail" in json ? json.detail : "") ||
                  "The portal could not be reached.",
        );
        return;
      }
      usePortalStore.getState().setData(json as PortalPlanJson);
      // best-effort: plan (no credentials) into the cloud for the daily digest
      void mirrorPortal(json as PortalPlanJson);
    } catch {
      portal.setError("Could not reach the portal.");
    } finally {
      setFetching(false);
    }
  };

  // auto-fetch on every visit when enabled and credentials are stored
  useEffect(() => {
    if (!hydrated) return;
    const p = usePortalStore.getState();
    if (p.autoFetch && p.baseUrl && p.username && p.password) {
      void fetchNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

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

      {/* substitute plan portal */}
      <details className="card mb-8 px-5 py-4" open={entries.length === 0 || !!portal.error}>
        <summary className="cursor-pointer font-display text-base font-semibold tracking-tight">
          Substitute plan (Vertretungsplan)
          {portal.lastFetched && !portal.error && (
            <span className="ml-2 font-mono text-[10px] text-ink-soft">
              fetched {new Date(portal.lastFetched).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="portal-url">
              Portal URL
            </label>
            <input
              id="portal-url"
              className="field"
              placeholder="https://evbg.eltern-portal.org"
              value={portal.baseUrl}
              onChange={(e) =>
                usePortalStore.getState().setSettings({ ...portal, baseUrl: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label" htmlFor="portal-email">
              Portal email
            </label>
            <input
              id="portal-email"
              type="email"
              className="field"
              autoComplete="off"
              value={portal.username}
              onChange={(e) =>
                usePortalStore.getState().setSettings({ ...portal, username: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label" htmlFor="portal-password">
              Portal password
            </label>
            <input
              id="portal-password"
              type="password"
              className="field"
              autoComplete="off"
              value={portal.password}
              onChange={(e) =>
                usePortalStore.getState().setSettings({ ...portal, password: e.target.value })
              }
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={portal.autoFetch}
              onChange={(e) =>
                usePortalStore.getState().setSettings({ ...portal, autoFetch: e.target.checked })
              }
            />
            fetch automatically on every visit
          </label>
          <button
            className="btn-primary"
            disabled={fetching || !portal.baseUrl || !portal.username || !portal.password}
            onClick={() => void fetchNow()}
          >
            <RefreshCcw className={cn("size-4", fetching && "animate-spin")} />
            {fetching ? "Fetching…" : "Fetch now"}
          </button>
        </div>
        {portal.error && <p className="mt-3 text-sm text-marker">{portal.error}</p>}
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-soft">
          credentials are stored only on this device and sent only to your own server when
          fetching.
        </p>
      </details>

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
              each entry: day · period · subject — optional: time · teacher · room. days:
              mon–sun (EN or DE).
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
        <>
          {/* legend */}
          {(relevantSubs.length > 0 || portal.error) && (
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-ink-soft">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full bg-marker" /> cancelled
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full bg-amber" /> substituted
              </span>
              {relevantSubs.length > 0 && <span>· {relevantSubs.length} for your courses</span>}
            </div>
          )}
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
                      const items = entries.filter((e) => e.day === d && e.period === p);
                      const cellSubs = cellSubsFor(d, p, items);
                      const cancelled = cellSubs.some((s) => s.cancelled);
                      const substituted = cellSubs.some((s) => !s.cancelled);
                      return (
                        <td
                          key={d}
                          className={cn(
                            "border-b border-line px-2 py-2 align-top transition-colors",
                            d === todayCol && "bg-accent/[0.06]",
                            cancelled && items.length > 0 && "bg-marker/[0.08]",
                            substituted && !cancelled && items.length > 0 && "bg-amber/[0.07]",
                          )}
                        >
                          {items.length === 0 && cellSubs.length === 0 ? (
                            <span className="text-ink-soft/40">—</span>
                          ) : (
                            <div className="space-y-1.5">
                              {items.map((e, i) => (
                                <div key={i}>
                                  <div className="flex items-center gap-1.5">
                                    <SubjectDot color={subjectColor(e.subject, subjectColors)} />
                                    <span
                                      className={cn(
                                        "text-xs leading-tight font-semibold",
                                        cancelled && "line-through decoration-marker",
                                      )}
                                    >
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
                              {cellSubs.map((s, i) => (
                                <span
                                  key={`s${i}`}
                                  className={cn(
                                    "chip max-w-full",
                                    s.cancelled
                                      ? "border-marker/40 bg-marker/10 text-marker"
                                      : "border-amber/40 bg-amber/10 text-amber",
                                  )}
                                  title={`${s.date} · ${s.info || (s.cancelled ? "cancelled" : "substitution")}`}
                                >
                                  {s.cancelled
                                    ? "cancelled"
                                    : `→ ${s.substitute || "?"}${s.room ? ` · ${s.room}` : ""}`}
                                  {" · "}
                                  {s.date.slice(0, 6)}
                                </span>
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
        </>
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

      {/* substitutions list — all the info */}
      {relevantSubs.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold tracking-tight">Substitutions</h2>
          <div className="space-y-4">
            {portal.data?.days.map((day) => {
              const daySubs = relevantSubs.filter((s) => s.date === day.date);
              if (daySubs.length === 0) return null;
              return (
                <div key={day.date} className="card px-5 py-4">
                  <p className="font-mono text-[11px] text-ink-soft">
                    {day.weekday}., {day.date}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {daySubs.map((s) => (
                      <li
                        key={s.period + s.course + (s.substitute ?? "")}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <span
                          className={cn(
                            "chip font-mono",
                            s.cancelled
                              ? "border-marker/40 bg-marker/10 text-marker"
                              : "border-amber/40 bg-amber/10 text-amber",
                          )}
                        >
                          {s.period}.
                        </span>
                        <span className="font-medium">
                          {s.courseOld && (
                            <span className="mr-1 text-ink-soft line-through">{s.courseOld}</span>
                          )}
                          {s.course}
                        </span>
                        {!s.cancelled && s.substitute && (
                          <span className="text-ink-soft">→ {s.substitute}</span>
                        )}
                        {s.room && (
                          <span className="font-mono text-xs text-ink-soft">room {s.room}</span>
                        )}
                        {s.info && <span className="text-xs text-ink-soft">{s.info}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface PortalPlanJson {
  days: PortalPlanJsonDay[];
  courses: string[];
  stand: string | null;
}
interface PortalPlanJsonDay {
  date: string;
  weekday: string;
  entries: PortalSub[];
}
