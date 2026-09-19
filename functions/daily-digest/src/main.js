import { createHash } from "node:crypto";

/**
 * Semester — daily digest (Appwrite Function, scheduled daily).
 *
 * For every user that has synced data it sends up to three push notifications
 * via Appwrite Messaging:
 *
 *   1. "Classes tomorrow"  — the timetable for the next day, with
 *      CANCELLED / substituted lessons taken from the mirrored Eltern-portal
 *      substitute plan (the apps mirror the *plan only* — credentials never
 *      leave the device).
 *   2. "Due soon"          — open todos & homework that are overdue or due
 *      tomorrow.
 *   3. "This week"         — exams, deadlines & events within the next 7 days.
 *
 * Everything is read as STRUCTURED ROWS from the `semester` tables (one row
 * per entity, `deleted` tombstones): subjects · todos · homeworks · events ·
 * timetable_entries · portal_entries · portal_courses.
 *
 * Empty digests are skipped; each message id is deterministic per day, so
 * re-runs on the same day never double-send.
 *
 * Required function scopes (appwrite.config.json → functions[].scopes):
 *   documents.read  — read table rows
 *   messages.write  — create push messages
 * The scoped API key is injected as APPWRITE_API_KEY.
 */

const ENDPOINT = (process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/+$/, "");
/** project id: injected by Appwrite, or the default project this repo deploys to */
const PROJECT_ID =
  process.env.APPWRITE_FUNCTION_PROJECT_ID ||
  process.env.APPWRITE_PROJECT_ID ||
  "6aac46e3001a9ef65b25";
const API_KEY = process.env.APPWRITE_API_KEY || "";

const DATABASE_ID = "semester";

/** timetable day keys, Monday-first */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Date.getDay() (0 = Sunday) → timetable day key */
const JS_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ------------------------------------------------------------------ */
/* Appwrite REST helpers (no SDK — keeps the deployment tiny)          */
/* ------------------------------------------------------------------ */

async function aw(path, options = {}) {
  const res = await fetch(`${ENDPOINT}${path}`, {
    ...options,
    headers: {
      "X-Appwrite-Project": PROJECT_ID,
      "X-Appwrite-Key": API_KEY,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    const err = new Error(`${path} → ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** structured rows of one table (new tablesdb API, JSON queries) */
async function listRows(table, userId) {
  const params = new URLSearchParams();
  [
    { method: "equal", attribute: "userId", values: [userId] },
    { method: "limit", values: [100] },
  ].forEach((q, i) => params.append(`queries[${i}]`, JSON.stringify(q)));
  const res = await aw(
    `/tablesdb/${DATABASE_ID}/tables/${table}/rows?${params.toString()}`,
  );
  return res?.rows ?? [];
}

/** list rows across ALL users of a table (discovery, no userId filter) */
async function listAllRows(table) {
  const params = new URLSearchParams();
  params.append("queries[0]", JSON.stringify({ method: "limit", values: [100] }));
  const res = await aw(`/tablesdb/${DATABASE_ID}/tables/${table}/rows?${params.toString()}`);
  return res?.rows ?? [];
}

/** every user that has at least one synced row (union over a few tables) */
async function usersWithData() {
  const userIds = new Set();
  for (const table of ["subjects", "timetable_entries", "todos", "events"]) {
    const rows = await listAllRows(table).catch(() => []);
    for (const row of rows) if (row.userId) userIds.add(row.userId);
    if (userIds.size > 0) break; // one table listing every user is enough
  }
  return [...userIds];
}

async function sendPush(userId, kind, title, body) {
  const now = new Date();
  const day = ymd(now).replaceAll("-", "");
  const hash = createHash("sha256").update(`${userId}:${kind}:${day}`).digest("hex").slice(0, 8);
  const messageId = `dgt-${kind}-${day}-${hash}`.slice(0, 36);
  try {
    await aw("/messaging/messages/push", {
      method: "POST",
      body: JSON.stringify({
        messageId,
        title,
        body,
        users: [userId],
        draft: false,
      }),
    });
    return "sent";
  } catch (e) {
    if (e.status === 409) return "already-sent"; // deterministic id → re-run same day
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* date helpers                                                        */
/* ------------------------------------------------------------------ */

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "18.09.2026" (Eltern-portal format) → "2026-09-18" or null */
function parseDeDate(s) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s ?? "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/* ------------------------------------------------------------------ */
/* digest builders — each returns {title, body} or null (→ not sent)   */
/* ------------------------------------------------------------------ */

function classesTomorrow(entries, subs, courses) {
  if (entries.length === 0) return null;

  const t = addDays(1);
  const tKey = ymd(t);
  const day = JS_DAY[t.getDay()];

  const lessons = entries.filter((e) => e.day === day);
  if (lessons.length === 0) return null; // weekend / free day

  // mirrored substitute plan for tomorrow
  const tomorrowSubs = subs.filter((s) => parseDeDate(s.date) === tKey);
  const courseCodes = courses.map((c) => String(c).trim());

  const periods = [...new Set(lessons.map((e) => e.period))].sort((a, b) => a - b);
  const lines = [];
  let cancelled = 0;
  let substituted = 0;

  for (const p of periods) {
    for (const e of lessons.filter((x) => x.period === p)) {
      const cellSubs = tomorrowSubs.filter(
        (s) =>
          parseInt(s.period, 10) === p &&
          courseCodes.includes(String(s.course).trim()) &&
          (String(e.subject).trim() === String(s.course).trim() ||
            String(e.teacher ?? "").trim() === String(s.course).trim()),
      );
      const isCancelled = cellSubs.some((s) => s.cancelled);
      const sub = cellSubs.find((s) => !s.cancelled);
      if (isCancelled) {
        cancelled += 1;
        lines.push(`${p}. ${e.subject} — CANCELLED`);
      } else if (sub) {
        substituted += 1;
        lines.push(
          `${p}. ${e.subject} → ${sub.substitute || "substitution"}${sub.room ? ` · ${sub.room}` : ""}`,
        );
      } else {
        lines.push(`${p}. ${e.subject}${e.room ? ` · ${e.room}` : ""}`);
      }
    }
  }

  const weekday = DAYS.indexOf(day) >= 0 ? day : "";
  return {
    title: `Tomorrow${weekday ? ` (${weekday})` : ""} · ${lessons.length} lessons${cancelled ? ` · ${cancelled} cancelled` : ""}`,
    body:
      lines.join("\n") +
      (subs.length
        ? ""
        : "\n\n(no Vertretungsplan mirrored — open the Timetable page once while signed in to include cancellations)"),
    meta: { cancelled, substituted },
  };
}

function dueSoon(todos, homework, subjects) {
  const subjectName = (id) => subjects.find((s) => s.id === id)?.name ?? null;

  const windows = [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21); // catch long-overdue
  const end = addDays(2);
  end.setHours(23, 59, 59, 999);

  const collect = (list, kind) => {
    for (const item of list ?? []) {
      if (item.done || !item.due) continue;
      const d = new Date(item.due);
      if (Number.isNaN(d.getTime()) || d < start || d > end) continue;
      const overdue = d < now;
      const isTomorrow = ymd(d) === ymd(addDays(1));
      const isToday = ymd(d) === ymd(now);
      const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const hasTime = String(item.due).includes("T");
      const label = overdue
        ? "OVERDUE"
        : isToday
          ? `today${hasTime ? ` ${hhmm}` : ""}`
          : isTomorrow
            ? `tomorrow${hasTime ? ` ${hhmm}` : ""}`
            : "soon";
      const subj = subjectName(item.subjectId);
      windows.push({
        sort: d.getTime(),
        line: `${item.priority === "high" ? "‼️ " : ""}${label} — ${subj ? `${subj}: ` : ""}${item.title} (${kind})`,
        overdue,
      });
    }
  };

  collect(todos, "task");
  collect(homework, "homework");
  if (windows.length === 0) return null;
  windows.sort((a, b) => a.sort - b.sort);

  const overdue = windows.filter((w) => w.overdue).length;
  return {
    title: `Due soon · ${windows.length} open${overdue ? ` · ${overdue} overdue` : ""}`,
    body: windows.slice(0, 12).map((w) => w.line).join("\n"),
  };
}

function weekAhead(events, subjects) {
  const list = events;
  if (list.length === 0) return null;

  const from = ymd(addDays(1));
  const until = ymd(addDays(7));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const typeLabel = { exam: "Exam", deadline: "Deadline", study: "Study", event: "Event" };

  const subjectName = (id) => subjects.find((s) => s.id === id)?.name ?? null;
  const rows = [];
  for (const e of list) {
    if (!e.date || e.date < from || e.date > until) continue;
    const d = new Date(`${e.date}T00:00:00`);
    const date = `${wd[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
    const subj = subjectName(e.subjectId);
    rows.push({
      sort: e.type === "exam" ? 0 : e.type === "deadline" ? 1 : 2,
      line: `${typeLabel[e.type] ?? "Event"}: ${subj ? `${subj} — ` : ""}${e.title} · ${date}${e.time ? ` ${e.time}` : ""}`,
    });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.sort - b.sort);
  return { title: "Next 7 days", body: rows.slice(0, 12).map((r) => r.line).join("\n") };
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export default async ({ req, res, log, error }) => {
  if (!API_KEY) {
    const names = Object.keys(process.env).filter((k) => k.toUpperCase().includes("APPWRITE") || k.toUpperCase().includes("API"));
    error(`Missing APPWRITE_API_KEY. Available env keys: ${names.join(", ") || "(none)"}`);
    return res.json({ ok: false, error: "not_configured", envKeys: names }, 500);
  }

  let userIds;
  try {
    userIds = await usersWithData();
  } catch (e) {
    error(`Could not list rows: ${e.message}`);
    return res.json({ ok: false, error: "database_read_failed", detail: e.message }, 500);
  }

  const results = [];
  for (const userId of userIds) {
    try {
      const [timetableRows, subRows, courseRows, subjectRows, todoRows, homeworkRows, eventRows] =
        await Promise.all([
          listRows("timetable_entries", userId),
          listRows("portal_entries", userId),
          listRows("portal_courses", userId),
          listRows("subjects", userId),
          listRows("todos", userId),
          listRows("homeworks", userId),
          listRows("events", userId),
        ]);

      // structured rows → entity arrays (tombstones excluded)
      const alive = (rows) => rows.filter((r) => r.deleted !== true);
      const subjects = alive(subjectRows);
      const todos = alive(todoRows);
      const homework = alive(homeworkRows);
      const events = alive(eventRows);
      const entries = alive(timetableRows);
      const subs = alive(subRows);
      const courses = alive(courseRows).map((r) => r.course);

      const messages = [
        ["classes", classesTomorrow(entries, subs, courses)],
        ["tasks", dueSoon(todos, homework, subjects)],
        ["week", weekAhead(events, subjects)],
      ].filter(([, m]) => m !== null);

      const sent = [];
      for (const [kind, m] of messages) {
        sent.push([kind, await sendPush(userId, kind, m.title, m.body)]);
      }
      log(`${userId.slice(0, 8)}… → ${sent.map(([k, s]) => `${k}:${s}`).join(", ") || "nothing to send"}`);
      results.push({ userId, sent });
    } catch (e) {
      error(`user ${userId}: ${e.message}`);
      results.push({ userId, error: e.message });
    }
  }

  return res.json({ ok: true, users: results.length, results });
};
