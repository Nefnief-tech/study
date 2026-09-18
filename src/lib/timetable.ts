import type { TimetableEntry } from "./types";

export const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_ALIASES: Record<string, string> = {
  mon: "Mon", monday: "Mon", mo: "Mon",
  tue: "Tue", tues: "Tue", tuesday: "Tue", di: "Tue",
  wed: "Wed", weds: "Wed", wednesday: "Wed", mi: "Wed",
  thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu", "do": "Thu",
  fri: "Fri", friday: "Fri", fr: "Fri",
  sat: "Sat", saturday: "Sat",
  sun: "Sun", sunday: "Sun",
};

function normalizeDay(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return DAY_ALIASES[raw.trim().toLowerCase()] ?? null;
}

function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function pickPeriod(obj: Record<string, unknown>): number | undefined {
  for (const k of ["period", "hour", "stunde", "lesson"]) {
    const v = (obj[k.toLowerCase()] ?? obj[k]) as unknown;
    const n = typeof v === "string" ? parseInt(v, 10) : (v as number);
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return undefined;
}

export interface ParseResult {
  entries: TimetableEntry[];
  warnings: string[];
}

/**
 * Accepts either a flat JSON array of lessons
 *   [{ "day": "mon", "period": 1, "time": "08:00", "subject": "Math", "teacher": "…", "room": "…" }]
 * or an object grouped by day
 *   { "mon": [{ "period": 1, "subject": "Math" }], "tue": [ … ] }
 * Keys are matched case-insensitively; day names in EN or DE.
 */
export function parseTimetable(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("That isn't valid JSON — check for missing commas or quotes.");
  }

  const warnings: string[] = [];
  const rows: Array<{ day: unknown; item: Record<string, unknown> }> = [];

  if (Array.isArray(data)) {
    data.forEach((item, i) => {
      if (item && typeof item === "object")
        rows.push({ day: (item as Record<string, unknown>).day, item: item as Record<string, unknown> });
      else warnings.push(`Row ${i + 1} skipped — not an object.`);
    });
  } else if (data && typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      if (!Array.isArray(value)) {
        warnings.push(`Skipped "${key}" — the value isn't a list.`);
        continue;
      }
      for (const item of value) {
        if (item && typeof item === "object")
          rows.push({ day: key, item: item as Record<string, unknown> });
      }
    }
  } else {
    throw new Error("Expected a JSON array of lessons or an object grouped by day.");
  }

  const entries: TimetableEntry[] = [];
  rows.forEach(({ day: rawDay, item }, i) => {
    const subject = pick(item, ["subject", "name", "fach", "lesson"]);
    if (!subject) {
      warnings.push(`Row ${i + 1}: no subject found — skipped.`);
      return;
    }
    const day = normalizeDay(rawDay ?? pick(item, ["day", "tag"]));
    if (!day) {
      warnings.push(`Row ${i + 1}: unknown day "${String(rawDay ?? "")}" — skipped.`);
      return;
    }
    const time = pick(item, ["time", "zeit", "times", "slot"]);
    const period = pickPeriod(item) ?? (time ? parsePeriodFromTime(time) ?? i + 1 : i + 1);
    entries.push({
      day,
      period,
      time,
      subject,
      teacher: pick(item, ["teacher", "lehrer"]),
      room: pick(item, ["room", "raum"]),
    });
  });

  if (entries.length === 0)
    throw new Error("No lessons found — each entry needs at least a day and a subject.");

  entries.sort(
    (a, b) =>
      DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.period - b.period,
  );
  return { entries, warnings };
}

function parsePeriodFromTime(time: string): number | undefined {
  const hour = parseInt(time.split(":")[0], 10);
  if (!Number.isFinite(hour)) return undefined;
  // typical German school day 08:00–17:00 → ~8 periods
  return Math.max(1, Math.min(8, hour - 7));
}

/** rebuilds the flat JSON form from stored entries (for the edit panel) */
export function timetableToJson(entries: TimetableEntry[]): string {
  return JSON.stringify(
    entries.map(({ day, period, time, subject, teacher, room }) => ({
      day,
      period,
      ...(time ? { time } : {}),
      subject,
      ...(teacher ? { teacher } : {}),
      ...(room ? { room } : {}),
    })),
    null,
    2,
  );
}

export const EXAMPLE_TIMETABLE = `[
  { "day": "mon", "period": 1, "time": "08:00 - 08:45", "subject": "Mathematics", "teacher": "Ms. Curve", "room": "B102" },
  { "day": "mon", "period": 2, "time": "08:50 - 09:35", "subject": "Mathematics", "teacher": "Ms. Curve", "room": "B102" },
  { "day": "mon", "period": 3, "time": "09:55 - 10:40", "subject": "English", "teacher": "Mr. Words", "room": "A204" },
  { "day": "tue", "period": 1, "time": "08:00 - 08:45", "subject": "Biology", "teacher": "Ms. Cell", "room": "Lab 2" },
  { "day": "tue", "period": 3, "time": "09:55 - 10:40", "subject": "History", "teacher": "Mr. Past", "room": "C110" },
  { "day": "wed", "period": 2, "time": "08:50 - 09:35", "subject": "Spanish", "teacher": "Sr. Lopez", "room": "B004" },
  { "day": "thu", "period": 1, "time": "08:00 - 08:45", "subject": "Physics", "teacher": "Ms. Newton", "room": "Lab 1" },
  { "day": "fri", "period": 4, "time": "10:45 - 11:30", "subject": "Sports", "teacher": "Coach Run", "room": "Gym" }
]`;
