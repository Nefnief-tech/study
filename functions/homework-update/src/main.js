import { createHash } from "node:crypto";

/**
 * Semester — homework update (Appwrite Function, scheduled twice per day).
 *
 * Schedule: "0 13,18 * * *" — 15:00 and 20:00 Austria time in summer
 * (UTC+2; an hour earlier in winter, Cloud rejects TZ suffixes). The slot
 * is derived from the fire time (UTC hour <15 → afternoon, else evening)
 * and names the deterministic message id, so re-runs on the same day in
 * the same slot never double-send.
 *
 * Sends ONE homework-only push per user:
 *   overdue homework, due today, due tomorrow, and homework added today.
 * Nothing open → no push at all.
 *
 * Rows are read as STRUCTURED ROWS from the `semester` tables (homeworks ·
 * subjects), one row per entity with `deleted` tombstones.
 *
 * TESTING: set the env var HW_TEST_USER to a user id. While it is set,
 * EVERY run — manual executions AND the schedule — sends a fresh
 * "[TEST] Homework: …" push to just that user: unique id (no idempotent
 * skip), delivered even when nothing is open. That makes Execute in the
 * console a repeatable test button. Remove the variable to go live.
 *
 * Required function scopes (appwrite.config.json → functions[].scopes):
 *   documents.read  — read table rows
 *   messages.write  — create push messages
 * The scoped API key is injected as APPWRITE_API_KEY (see README).
 */

const ENDPOINT = (process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/+$/, "");
// hardening: the only outbound host is the Appwrite-injected endpoint — refuse
// anything else so a bad env var can't turn this function into a request proxy
if (!/^https:\/\/[a-z0-9.-]+\/?/i.test(ENDPOINT)) {
  throw new Error(`homework-update: refusing non-https endpoint "${ENDPOINT.slice(0, 40)}"`);
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
    throw new Error(`homework-update: refusing endpoint ${url.protocol}//${url.hostname}`);
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

/** flatten JSON queries into `queries[i]=…` params (TablesDB API) */
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
  for (const table of ["subjects", "homeworks", "todos", "events"]) {
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

async function sendPush(userId, slot, ymd, title, body) {
  const hash = createHash("sha256").update(`hw:${userId}:${slot}:${ymd}`).digest("hex").slice(0, 8);
  const messageId = `hw-${slot}-${ymd}-${hash}`.slice(0, 36);
  try {
    await aw("/messaging/messages/push", {
      method: "POST",
      body: JSON.stringify({
        messageId,
        title,
        body,
        users: [userId],
        draft: false,
        // tap-through: the apps read data.route and land on the page
        data: { route: "homework" },
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

function addDays(now, n) {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  return d;
}

/** afternoon run (~15:00 local) or evening run (~20:00 local) */
function slotOf(now) {
  return now.getUTCHours() < 15 ? "afternoon" : "evening";
}

/** homework rows carry an epoch integer (apps write ms, older rows seconds) */
function createdMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

/* ------------------------------------------------------------------ */
/* homework collection                                                 */
/* ------------------------------------------------------------------ */

/**
 * open homework grouped into: overdue, due today, due tomorrow, added today.
 * `addedToday` excludes items already listed in the due buckets, so nothing
 * appears twice. Long-overdue (back 21 days) is caught like in the digest.
 */
function homeworkUpdate(now, homework, subjects) {
  const subjectName = (id) => subjects.find((s) => s.id === id)?.name ?? null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21);
  const end = addDays(now, 1);
  end.setHours(23, 59, 59, 999);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const buckets = { overdue: [], today: [], tomorrow: [], added: [] };
  const seen = new Set();

  for (const hw of homework ?? []) {
    if (hw.done || hw.deleted === true || !hw.due) continue;
    const d = new Date(hw.due);
    if (Number.isNaN(d.getTime()) || d < start || d > end) continue;
    const subj = subjectName(hw.subjectId);
    const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const hasTime = String(hw.due).includes("T");
    const title = `${subj ? `${subj}: ` : ""}${hw.title}`;
    const line = `${d < now ? "OVERDUE" : "today"}${hasTime ? ` ${hhmm}` : ""} — ${title}${hw.priority === "high" ? " ‼️" : ""}`;
    if (d < now) buckets.overdue.push({ id: hw.$id, sort: d.getTime(), line });
    else if (ymd(d) === ymd(now)) buckets.today.push({ id: hw.$id, sort: d.getTime(), line });
    else buckets.tomorrow.push({ id: hw.$id, sort: d.getTime(), line });
    seen.add(hw.$id);
  }

  for (const hw of homework ?? []) {
    if (hw.done || hw.deleted === true || seen.has(hw.$id)) continue;
    const c = createdMs(hw.createdAt);
    if (c === null || c < midnight) continue;
    const subj = subjectName(hw.subjectId);
    buckets.added.push({
      id: hw.$id,
      sort: c,
      line: `new — ${subj ? `${subj}: ` : ""}${hw.title}${hw.due ? ` (due ${hw.due.replace("T", " ")})` : ""}`,
    });
  }

  for (const b of Object.values(buckets)) b.sort((a, b) => a.sort - b.sort);

  const open = buckets.overdue.length + buckets.today.length + buckets.tomorrow.length;
  return {
    open,
    counts: {
      open,
      overdue: buckets.overdue.length,
      added: buckets.added.length,
    },
    lines: [
      ...buckets.overdue.map((x) => x.line),
      ...buckets.today.map((x) => x.line),
      ...buckets.tomorrow.map((x) => x.line),
      ...buckets.added.map((x) => x.line),
    ].slice(0, 8),
    hidden:
      buckets.overdue.length + buckets.today.length + buckets.tomorrow.length + buckets.added.length -
      Math.min(
        8,
        buckets.overdue.length + buckets.today.length + buckets.tomorrow.length + buckets.added.length,
      ),
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

  // TEST MODE: while HW_TEST_USER is set, EVERY run — scheduled included —
  // sends only a "[TEST]" push to that user, with a unique id (no idempotent
  // skip) and even when nothing is open. There is no reliable trigger signal
  // on Cloud 2.2 (no APPWRITE_FUNCTION_TRIGGER — verified 2026-09-21), so the
  // [TEST] title prefix makes the mode obvious. Remove the variable to go live.
  const testUser = process.env.HW_TEST_USER || "";
  const testMode = testUser !== "";
  log(`testMode=${testMode}`);

  const now = process.env.HW_NOW ? new Date(process.env.HW_NOW) : new Date();
  const slot = slotOf(now);
  const day = ymd(now);

  let userIds;
  try {
    userIds = testMode ? [testUser] : await usersWithData();
  } catch (e) {
    error(`Could not list rows: ${e.message}`);
    await alertPush("homework", e.message);
    return res.json({ ok: false, error: "database_read_failed", detail: e.message }, 500);
  }

  const results = [];
  for (const userId of userIds) {
    try {
      const [homeworkRows, subjectRows] = await Promise.all([
        listRows("homeworks", userId),
        listRows("subjects", userId),
      ]);
      const homework = homeworkRows.filter((r) => r.deleted !== true);
      const subjects = subjectRows.filter((r) => r.deleted !== true);

      const upd = homeworkUpdate(now, homework, subjects);

      if (upd.lines.length === 0 && !testMode) {
        log(`${userId.slice(0, 8)}… ${slot}: nothing open`);
        results.push({ userId, slot, sent: "nothing" });
        continue;
      }

      const c = upd.counts;
      const titleParts = [`${c.open} open`];
      if (c.overdue) titleParts.push(`${c.overdue} overdue`);
      if (c.added) titleParts.push(`${c.added} new`);
      const title = `${testMode ? "[TEST] " : ""}Homework: ${titleParts.join(" · ")}`;
      const body =
        upd.lines.length > 0
          ? upd.lines.join("\n") + (upd.hidden > 0 ? `\n… +${upd.hidden} more` : "")
          : "Nothing open — all homework done. 🎉";

      let status;
      if (testMode) {
        // unique id → every manual run actually delivers, no idempotent skip
        const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(8, 14);
        await aw("/messaging/messages/push", {
          method: "POST",
          body: JSON.stringify({
            messageId: `hw-test-${stamp}`.slice(0, 36),
            title,
            body,
            users: [userId],
            draft: false,
            data: { route: "homework" },
          }),
        });
        status = "test-sent";
      } else {
        status = await sendPush(userId, slot, day, title, body);
      }
      log(`${userId.slice(0, 8)}… ${slot} → ${status}: ${title}`);
      results.push({ userId, slot, sent: status, title });
    } catch (e) {
      error(`user ${userId}: ${e.message}`);
      results.push({ userId, error: e.message });
    }
  }

  // every single user errored → the run effectively failed; alert once
  if (results.length > 0 && results.every((r) => r.error)) {
    await alertPush("homework", results.map((r) => r.error).join(" | "));
  }

  return res.json({ ok: true, slot, testMode, users: results.length, results });
};
