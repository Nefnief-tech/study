import { createHash } from "node:crypto";

/**
 * Semester — daily digest (Appwrite Function, scheduled three times per day).
 *
 * Schedule: "20 5,11,19 * * *" — 07:20, 13:30 and 21:00 Austria time in
 * summer (UTC+2; an hour earlier in winter, Cloud rejects TZ suffixes).
 * The function derives the slot from the fire time (UTC hour: <10 → morning,
 * <15 → afternoon, else evening) and sends ONE consolidated push per user:
 *
 *   morning   (07:20) — today's timetable (with live substitutions),
 *               what's due today/overdue, and events of the coming week
 *   afternoon (13:30) — tomorrow's timetable, what's due tomorrow/overdue,
 *               and the next 7 days of events
 *   evening   (21:00) — tomorrow's plan again, ready before bedtime
 *
 * Everything is read as STRUCTURED ROWS from the `semester` tables (one row
 * per entity, `deleted` tombstones): subjects · todos · homeworks · events ·
 * timetable_entries · portal_entries · portal_courses.
 *
 * Empty digests are skipped; the message id is deterministic per user/slot/
 * day, so re-runs on the same day never double-send.
 *
 * DIGEST_NOW (ISO date, optional, test hook): overrides "now" — used by the
 * mock harness to simulate morning/evening runs. Never set in production.
 *
 * Required function scopes (appwrite.config.json → functions[].scopes):
 *   documents.read  — read table rows
 *   messages.write  — create push messages
 * The scoped API key is injected as APPWRITE_API_KEY.
 */

const ENDPOINT = (process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/+$/, "");
// hardening: the only outbound host is the Appwrite-injected endpoint — refuse
// anything else so a bad env var can't turn this function into a request proxy
if (!/^https:\/\/[a-z0-9.-]+\/?/i.test(ENDPOINT)) {
  throw new Error(`daily-digest: refusing non-https endpoint "${ENDPOINT.slice(0, 40)}"`);
}
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

/** only these hosts may be requested — ENDPOINT is Appwrite-injected, but the
 * guard keeps a bad env var from pointing the function at anything else */
const ALLOWED_HOSTS = new Set(["fra.cloud.appwrite.io", "cloud.appwrite.io"]);

async function aw(path, options = {}) {
  // path is always a literal Appwrite API route built inside this file.
  // plain concatenation, NOT new URL(path, ENDPOINT): a "/"-prefixed path
  // resolves against the ORIGIN, silently dropping the /v1 segment (404 HTML
  // → "no users" — this exact bug silenced the whole digest for two days)
  const url = new URL(`${ENDPOINT}${path}`);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`daily-digest: refusing endpoint ${url.protocol}//${url.hostname}`);
  }
  const res = await fetch(url, {
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

/** every user that has at least one synced row (union over a few tables).
 * No error swallowing here: a failed table read must surface as a 500 with
 * logs, not silently turn into "no users" (that bug cost us days once) */
async function usersWithData() {
  const userIds = new Set();
  for (const table of ["subjects", "timetable_entries", "todos", "events"]) {
    const rows = await listAllRows(table);
    for (const row of rows) if (row.userId) userIds.add(row.userId);
    if (userIds.size > 0) break; // one table listing every user is enough
  }
  return [...userIds];
}

async function sendPush(userId, slot, ymd, title, body) {
  const hash = createHash("sha256").update(`${userId}:${slot}:${ymd}`).digest("hex").slice(0, 8);
  const messageId = `dgt-${slot}-${ymd}-${hash}`.slice(0, 36);
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
    if (e.status === 409) return "already-sent"; // deterministic id → re-run same slot
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
  const m = String(s ?? "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

function addDays(now, n) {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  return d;
}

/** morning (~07:20 local), afternoon (~13:30) or evening (~21:00) run */
function slotOf(now) {
  const h = now.getUTCHours();
  return h < 10 ? "morning" : h < 15 ? "afternoon" : "evening";
}

/* ------------------------------------------------------------------ */
/* digest builders                                                     */
/* ------------------------------------------------------------------ */

/** lessons of `targetDay` (offset from now) with mirrored substitutions */
function classesFor(entries, subs, courses, targetDay) {
  if (entries.length === 0) return null;

  const tKey = ymd(targetDay);
  const day = JS_DAY[targetDay.getDay()];

  const lessons = entries.filter((e) => e.day === day);
  if (lessons.length === 0) return null; // weekend / free day

  const daySubs = subs.filter((s) => parseDeDate(s.date) === tKey);
  const courseCodes = courses.map((c) => String(c).trim());

  const periods = [...new Set(lessons.map((e) => e.period))].sort((a, b) => a - b);
  const lines = [];
  let cancelled = 0;
  let substituted = 0;

  for (const p of periods) {
    for (const e of lessons.filter((x) => x.period === p)) {
      const cellSubs = daySubs.filter(
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

  return {
    weekday: DAYS.indexOf(day) >= 0 ? day : "",
    lessonCount: lessons.length,
    cancelled,
    substituted,
    lines,
  };
}

/** open todos & homework that are overdue or due within the next 2 days */
function dueSoon(now, todos, homework, subjects) {
  const subjectName = (id) => subjects.find((s) => s.id === id)?.name ?? null;

  const windows = [];
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21); // catch long-overdue
  const end = addDays(now, 2);
  end.setHours(23, 59, 59, 999);

  const collect = (list, kind) => {
    for (const item of list ?? []) {
      if (item.done || !item.due) continue;
      const d = new Date(item.due);
      if (Number.isNaN(d.getTime()) || d < start || d > end) continue;
      const overdue = d < now;
      const isTomorrow = ymd(d) === ymd(addDays(now, 1));
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
    count: windows.length,
    overdue,
    lines: windows.slice(0, 4).map((w) => w.line),
  };
}

/** exams, deadlines & events within the next 7 days (from `fromOffset`) */
function weekAhead(now, events, subjects, fromOffset) {
  const list = events;
  if (list.length === 0) return null;

  const from = ymd(addDays(now, fromOffset));
  const until = ymd(addDays(now, fromOffset + 7));
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
  return { lines: rows.slice(0, 3).map((r) => r.line) };
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

  const now = process.env.DIGEST_NOW ? new Date(process.env.DIGEST_NOW) : new Date();
  const slot = slotOf(now); // morning → today's plan, afternoon → tomorrow's
  const dayOffset = slot === "morning" ? 0 : 1;
  const dayWord = slot === "morning" ? "Today" : "Tomorrow";

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

      const classes = classesFor(entries, subs, courses, addDays(now, dayOffset));
      const due = dueSoon(now, todos, homework, subjects);
      const week = weekAhead(now, events, subjects, dayOffset);

      if (!classes && !due && !week) {
        log(`${userId.slice(0, 8)}… ${slot}: nothing to send`);
        results.push({ userId, slot, sent: "nothing" });
        continue;
      }

      /* one consolidated push */
      const bodyParts = [];
      const titleParts = [];
      if (classes) {
        titleParts.push(`${classes.lessonCount} lesson${classes.lessonCount === 1 ? "" : "s"}${classes.cancelled ? ` · ${classes.cancelled} cancelled` : ""}`);
        bodyParts.push(...classes.lines.slice(0, 7));
        if (classes.lines.length > 7) bodyParts.push(`… +${classes.lines.length - 7} more lessons`);
        if (subs.length === 0) {
          bodyParts.push("(no Vertretungsplan mirrored — open the Timetable page once to include substitutions)");
        }
      }
      if (due) {
        titleParts.push(`${due.count} due${due.overdue ? ` · ${due.overdue} overdue` : ""}`);
        bodyParts.push("", ...due.lines);
      }
      if (week) {
        bodyParts.push("", ...week.lines);
      }
      const weekday = classes?.weekday ? ` (${classes.weekday})` : "";
      const title = `${dayWord}${weekday}: ${titleParts.join(" · ")}`;

      const status = await sendPush(userId, slot, ymd(now), title, bodyParts.join("\n"));
      log(`${userId.slice(0, 8)}… ${slot} → ${status}: ${title}`);
      results.push({ userId, slot, sent: status, title });
    } catch (e) {
      error(`user ${userId}: ${e.message}`);
      results.push({ userId, error: e.message });
    }
  }

  return res.json({ ok: true, slot, users: results.length, results });
};
