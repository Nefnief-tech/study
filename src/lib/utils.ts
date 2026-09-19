import { format, parseISO, isValid } from "date-fns";
import type { GradeEntry, Priority, Subject } from "./types";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

/** deterministic 16-hex id for entities without a natural key (timetable
 * entries, portal subs, …) — MUST match the mobile implementation byte for
 * byte, since both sides derive the same cloud row id from the same content */
export function hashId(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatClock(at: number) {
  return new Date(at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** pulls a readable message out of an AI provider's error payload */
export function summarizeProviderError(detail?: string): string {
  if (!detail) return "";
  try {
    const json = JSON.parse(detail) as { error?: { message?: string } | string };
    if (typeof json.error === "string") return json.error;
    return json.error?.message ?? detail.slice(0, 160);
  } catch {
    return detail.slice(0, 160);
  }
}

/** stationery palette for subject colors */
export const PALETTE = [
  "#3E6B4F", // bottle green
  "#38618C", // ink blue
  "#C15B33", // terracotta
  "#B98A1C", // mustard
  "#8A4F7D", // plum
  "#3E7C7B", // teal
];

export function findSubject(subjects: Subject[], id?: string) {
  return id ? subjects.find((s) => s.id === id) : undefined;
}

/* ---------------- dates ---------------- */

export function parseDue(due?: string): Date | null {
  if (!due) return null;
  const d = parseISO(due);
  return isValid(d) ? d : null;
}

export interface DueInfo {
  date: Date;
  overdue: boolean;
  isToday: boolean;
  label: string; // "Today 17:00" / "Tomorrow" / "Fri 25 Sep"
}

export function dueInfo(due?: string): DueInfo | null {
  const date = parseDue(due);
  if (!date) return null;
  const today = new Date();
  const dayDiff = Math.round(
    (startOfDay(date).getTime() - startOfDay(today).getTime()) / 86_400_000,
  );
  let label: string;
  if (dayDiff === 0) label = "Today";
  else if (dayDiff === 1) label = "Tomorrow";
  else if (dayDiff === -1) label = "Yesterday";
  else if (dayDiff > 1 && dayDiff < 7) label = format(date, "EEEE");
  else label = format(date, "d MMM");
  if (due?.includes("T")) label += ` · ${format(date, "HH:mm")}`;
  return { date, overdue: dayDiff < 0, isToday: dayDiff === 0, label };
}

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** yyyy-MM-dd for a Date (local time) */
export function toDayKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

/** "Mon 21 Sep" style label for a yyyy-MM-dd key */
export function dayKeyLabel(key: string) {
  const d = parseISO(key);
  return isValid(d) ? format(d, "EEE d MMM") : key;
}

/* ---------------- grades (German Punkte system: 15 best → 0 worst) ---------------- */

/** weighted mean of Punkte; null when there is nothing to average */
export function weightedAverage(entries: Array<{ points: number; weight: number }>): number | null {
  const valid = entries.filter((e) => e.weight > 0);
  if (valid.length === 0) return null;
  const wSum = valid.reduce((s, e) => s + e.weight, 0);
  return valid.reduce((s, e) => s + e.points * e.weight, 0) / wSum;
}

export function weightSum(entries: Array<{ weight: number }>) {
  return entries.reduce((s, e) => s + e.weight, 0);
}

export function pointsTone(points: number): Tone {
  if (points >= 13) return "good";
  if (points >= 10) return "ok";
  if (points >= 4) return "warn";
  return "bad";
}

/** "11,7" — one decimal, German decimal comma */
export function formatPoints(points: number): string {
  return points.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** percent → Punkte (only used to migrate pre-Punkte entries) */
export function percentToPoints(pct: number): number {
  return Math.max(0, Math.min(15, Math.round((pct / 100) * 15)));
}

/** The Oberstufe table: every whole grade spans 3 points with +/− steps. */
export const POINTS_TABLE: Array<{ points: number; grade: string; note: string }> = [
  { points: 15, grade: "1+", note: "sehr gut" },
  { points: 14, grade: "1", note: "sehr gut" },
  { points: 13, grade: "1-", note: "sehr gut" },
  { points: 12, grade: "2+", note: "gut" },
  { points: 11, grade: "2", note: "gut" },
  { points: 10, grade: "2-", note: "gut" },
  { points: 9, grade: "3+", note: "befriedigend" },
  { points: 8, grade: "3", note: "befriedigend" },
  { points: 7, grade: "3-", note: "befriedigend" },
  { points: 6, grade: "4+", note: "ausreichend" },
  { points: 5, grade: "4", note: "ausreichend" },
  { points: 4, grade: "4-", note: "ausreichend" },
  { points: 3, grade: "5+", note: "mangelhaft" },
  { points: 2, grade: "5", note: "mangelhaft" },
  { points: 1, grade: "5-", note: "mangelhaft" },
  { points: 0, grade: "6", note: "ungenügend" },
];

/** translates a points value into the classic +/− grade (3 → 5+, 4 → 4− …) */
export function pointsToGrade(points: number): { grade: string; note: string; tone: Tone } {
  const p = Math.max(0, Math.min(15, Math.round(points)));
  const row = POINTS_TABLE.find((r) => r.points === p) ?? POINTS_TABLE[0];
  return { grade: row.grade, note: row.note, tone: pointsTone(p) };
}

/* ---------------- misc ---------------- */

export type Tone = "good" | "ok" | "warn" | "bad" | "neutral";

export const TONE_CLASSES: Record<Tone, string> = {
  good: "border-accent/30 bg-accent/10 text-accent",
  ok: "border-info/30 bg-info/10 text-info",
  warn: "border-amber/40 bg-amber/10 text-amber",
  bad: "border-marker/40 bg-marker/10 text-marker",
  neutral: "border-line bg-paper text-ink-soft",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
