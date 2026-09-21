import { createHash } from "node:crypto";

/**
 * Semester — weekly digest (Appwrite Function, Sundays 21:00 Austria time).
 *
 * Schedule: "0 19 * * 0" — Sunday 21:00 CEST / 20:00 CET (Cloud rejects TZ
 * suffixes). One push per user looking at the coming 7 days:
 *
 *   exams & deadlines (sorted first) · homework due · open tasks due
 *
 * Nothing ahead → no push. Message ids `wk-<date>-<hash>` are deterministic
 * per user/day, so re-runs on the same Sunday never double-send.
 *
 * Rows are read as STRUCTURED ROWS from the `semester` tables (events ·
 * homeworks · todos · subjects), one row per entity with `deleted`
 * tombstones, cursor-paginated past the 100/page cap.
 *
 * TESTING: set the env var WEEK_TEST_USER to a user id. While it is set,
 * EVERY run sends a fresh "[TEST] Week ahead: …" push to just that user —
 * unique id (no idempotent skip), delivered even when nothing is ahead.
 * Remove the variable to go live.
 *
 * Required scopes: documents.read + messages.write. The scoped API key is
 * injected as APPWRITE_API_KEY; ALERT_USER (optional) receives a push when
 * the run itself fails — Appwrite won't tell anyone.
 */

const ENDPOINT = (process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/+$/, "");
// hardening: the only outbound host is the Appwrite-injected endpoint — refuse
// anything else so a bad env var can't turn this function into a request proxy
if (!/^https:\/\/[a-z0-9.-]+\/?/i.test(ENDPOINT)) {
  throw new Error(`weekly-digest: refusing non-https endpoint "${ENDPOINT.slice(0, 40)}"`);
}
const PROJECT_ID =
  process.env.APPWRITE_FUNCTION_PROJECT_ID ||
  process.env.APPWRITE_PROJECT_ID ||
  "6aac46e3001a9ef65b25";
const API_KEY = process.env.APPWRITE_API_KEY || "";

const DATABASE_ID = "semester";

/* ------------------------------------------------------------------ */
/* Appwrite REST helpers (no SDK — keeps the deployment tiny)          */
/* ------------------------------------------------------------------ */

const ALLOWED_HOSTS = new Set(["fra.cloud.appwrite.io", "cloud.appwrite.io"]);

async function aw(path, options = {}) {
  // path is always a literal Appwrite API route built inside this file.
  // plain concatenation, NOT new URL(path, ENDPOINT): a "/"-prefixed path
  // resolves against the ORIGIN, silently dropping the /v1 segment
  const url = new URL(`${ENDPOINT}${path}`);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`weekly-digest: refusing endpoint ${url.protocol}//${url.hostname}`);
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

function queriesParam(queries) {
  const params = new URLSearchParams();
  queries.forEach((q, i) => params.append(`queries[${i}]`, JSON.stringify(q)));
  return params.toString();
}

/** every row of a table for a user — follows cursors past the 100/page cap */
async function listRows(table, userId) {
  const rows = [];
  let cursor;
  for (;;) {
    const queries = [
      { method: "equal", attribute: "userId", values: [userId] },
      { method: "limit", values: [100] },
    ];
    if (cursor) queries.push({ method: "cursor", values: [cursor] });
    const res = await aw(`/tablesdb/${DATABASE_ID}/tables/${table}/rows?${queriesParam(queries)}`);
    const page = res?.rows ?? [];
    rows.push(...page);
    if (page.length < 100) return rows;
    cursor = page[page.length - 1].$id;
  }
}

/** all rows of a table (user discovery, no userId filter), cursor-paginated */
async function listAllRows(table) {
  const rows = [];
  let cursor;
  for (;;) {
    const queries = [{ method: "limit", values: [100] }];
    if (cursor) queries.push({ method: "cursor", values: [cursor] });
    const res = await aw(`/tablesdb/${DATABASE_ID}/tables/${table}/rows?${queriesParam(queries)}`);
    const page = res?.rows ?? [];
    rows.push(...page);
    if (page.length < 100) return rows;
    cursor = page[page.length - 1].$id;
  }
}

/** every user that has at least one synced row — no silent error swallowing:
 * a failed read must surface as a 500 with logs, never as "no users" */
async function usersWithData() {
  const userIds = new Set();
  for (const table of ["subjects", "events", "homeworks", "todos"]) {
    const rows = await listAllRows(table);
    for (const row of rows) if (row.userId) userIds.add(row.userId);
    if (userIds.size > 0) break; // one table listing every user is enough
  }
  return [...userIds];
}

/** push the admin when a run fails — Appwrite won't tell anyone. Best-effort
 * and per-day idempotent so a flapping schedule can't spam. */
const ALERT_USER = process.env.ALERT_USER || "";
async function alertPush(what, detail) {
  if (!ALERT_USER) return;
  const today = ymd(new Date());
  const hash = createHash("sha256").update(`alert:${what}:${today}`).digest("hex").slice(0, 8);
  try {
    await aw("/messaging/messages/push", {
      method: "POST",
      body: JSON.stringify({
        messageId: `alert-${what}-${today}-${hash}`.slice(0, 36),
        title: `${what} failed`,
        body: detail.slice(0, 300),
        users: [ALERT_USER],
        draft: false,
      }),
    });
  } catch {}
}

async function sendPush(userId, ymd, title, body) {
  const hash = createHash("sha256").update(`wk:${userId}:${ymd}`).digest("hex").slice(0, 8);
  const messageId = `wk-${ymd}-${hash}`.slice(0, 36);
  try {
    await aw("/messaging/messages/push", {
      method: "POST",
      body: JSON.stringify({
        messageId,
        title,
        body,
        users: [userId],
        draft: false,
        data: { route: "calendar" },
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

function addDays(now, n) {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  return d;
}

/* ------------------------------------------------------------------ */
/* week-ahead builder                                                  */
/* ------------------------------------------------------------------ */

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPE_LABEL = { exam: "Exam", deadline: "Deadline", study: "Study", event: "Event" };

/** exams/deadlines first, then everything else — within the next 7 days */
function weekAhead(now, events, homework, todos, subjects) {
  const from = ymd(addDays(now, 1));
  const until = ymd(addDays(now, 7));
  const subjectName = (id) => subjects.find((s) => s.id === id)?.name ?? null;

  const rows = [];
  for (const e of events ?? []) {
    if (e.deleted === true || !e.date || e.date < from || e.date > until) continue;
    const d = new Date(`${e.date}T00:00:00`);
    const subj = subjectName(e.subjectId);
    rows.push({
      sort: (e.type === "exam" ? 0 : e.type === "deadline" ? 1 : 2) * 1e10 + d.getTime(),
      line: `${TYPE_LABEL[e.type] ?? "Event"}: ${subj ? `${subj} — ` : ""}${e.title} · ${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${e.time ? ` ${e.time}` : ""}`,
      kind: e.type === "exam" || e.type === "deadline" ? "exam" : "event",
    });
  }
  let homeworkDue = 0;
  for (const hw of homework ?? []) {
    if (hw.deleted === true || hw.done || !hw.due) continue;
    const d = new Date(hw.due);
    if (Number.isNaN(d.getTime()) || ymd(d) < from || ymd(d) > until) continue;
    homeworkDue += 1;
    if (rows.length >= 8) continue;
    const subj = subjectName(hw.subjectId);
    const hasTime = String(hw.due).includes("T");
    const hhmm = hasTime ? ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "";
    rows.push({
      sort: 3e10 + d.getTime(),
      line: `Homework: ${subj ? `${subj} — ` : ""}${hw.title} · ${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}${hhmm}`,
      kind: "homework",
    });
  }
  let tasksDue = 0;
  for (const t of todos ?? []) {
    if (t.deleted === true || t.done || !t.due) continue;
    const d = new Date(t.due);
    if (Number.isNaN(d.getTime()) || ymd(d) < from || ymd(d) > until) continue;
    tasksDue += 1;
    if (rows.length >= 8) continue;
    const subj = subjectName(t.subjectId);
    rows.push({
      sort: 4e10 + d.getTime(),
      line: `Task: ${subj ? `${subj} — ` : ""}${t.title} · ${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`,
      kind: "task",
    });
  }
  rows.sort((a, b) => a.sort - b.sort);

  const exams = rows.filter((r) => r.kind === "exam").length;
  return {
    lines: rows.slice(0, 8).map((r) => r.line),
    hidden: Math.max(0, rows.length - 8),
    exams,
    homeworkDue,
    tasksDue,
    total: rows.length,
  };
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

  // TEST MODE: while WEEK_TEST_USER is set, EVERY run sends a fresh "[TEST]"
  // push to that user only — unique id, no idempotent skip, sent even when
  // nothing is ahead. Remove the variable to go live.
  const testUser = process.env.WEEK_TEST_USER || "";
  const testMode = testUser !== "";
  log(`testMode=${testMode}`);

  const now = process.env.WEEK_NOW ? new Date(process.env.WEEK_NOW) : new Date();
  const day = ymd(now);

  let userIds;
  try {
    userIds = testMode ? [testUser] : await usersWithData();
  } catch (e) {
    error(`Could not list rows: ${e.message}`);
    await alertPush("weekly", e.message);
    return res.json({ ok: false, error: "database_read_failed", detail: e.message }, 500);
  }

  const results = [];
  for (const userId of userIds) {
    try {
      const [eventRows, homeworkRows, todoRows, subjectRows] = await Promise.all([
        listRows("events", userId),
        listRows("homeworks", userId),
        listRows("todos", userId),
        listRows("subjects", userId),
      ]);
      const subjects = subjectRows.filter((r) => r.deleted !== true);
      const events = eventRows.filter((r) => r.deleted !== true);
      const homework = homeworkRows.filter((r) => r.deleted !== true);
      const todos = todoRows.filter((r) => r.deleted !== true);

      const week = weekAhead(now, events, homework, todos, subjects);

      if (week.total === 0 && !testMode) {
        log(`${userId.slice(0, 8)}… nothing ahead this week`);
        results.push({ userId, sent: "nothing" });
        continue;
      }

      const titleParts = [];
      if (week.exams) titleParts.push(`${week.exams} exam${week.exams === 1 ? "" : "s"}`);
      if (week.homeworkDue) titleParts.push(`${week.homeworkDue} homework`);
      if (week.tasksDue) titleParts.push(`${week.tasksDue} task${week.tasksDue === 1 ? "" : "s"}`);
      const title = `${testMode ? "[TEST] " : ""}Week ahead: ${titleParts.length > 0 ? titleParts.join(" · ") : "all clear"}`;
      const body =
        week.lines.length > 0
          ? week.lines.join("\n") + (week.hidden > 0 ? `\n… +${week.hidden} more` : "")
          : "Nothing scheduled for the coming week. 🎉";

      let status;
      if (testMode) {
        // unique id → every manual run actually delivers, no idempotent skip
        const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(8, 14);
        await aw("/messaging/messages/push", {
          method: "POST",
          body: JSON.stringify({
            messageId: `wk-test-${stamp}`.slice(0, 36),
            title,
            body,
            users: [userId],
            draft: false,
            data: { route: "calendar" },
          }),
        });
        status = "test-sent";
      } else {
        status = await sendPush(userId, day, title, body);
      }
      log(`${userId.slice(0, 8)}… weekly → ${status}: ${title}`);
      results.push({ userId, sent: status, title });
    } catch (e) {
      error(`user ${userId}: ${e.message}`);
      results.push({ userId, error: e.message });
    }
  }

  // every single user errored → the run effectively failed; alert once
  if (results.length > 0 && results.every((r) => r.error)) {
    await alertPush("weekly", results.map((r) => r.error).join(" | "));
  }

  return res.json({ ok: true, testMode, users: results.length, results });
};
