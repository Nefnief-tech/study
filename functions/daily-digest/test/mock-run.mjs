// Local test harness for functions/daily-digest — stubs fetch, feeds a fake
// timetable/portal snapshot plus structured table rows (incl. a cancelled
// class and a tombstoned row) and prints the generated pushes.
import { createHash } from "node:crypto";
import handler from "../src/main.js";

const USER = "11111111-2222-3333-4444-555555555555";
const DB = "semester";
const snap = "snapshots";

const docId = (key) =>
  createHash("sha256").update(`${USER}:${snap}:${key}`).digest("hex").slice(0, 32);

// tomorrow as the function will compute it
const t = new Date();
t.setDate(t.getDate() + 1);
const tKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
const tDe = `${String(t.getDate()).padStart(2, "0")}.${String(t.getMonth() + 1).padStart(2, "0")}.${t.getFullYear()}`;
const JS_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const day = JS_DAY[t.getDay()];
const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const yesterday = inDays(-1);

const SNAPSHOTS = {
  timetable: { entries: [
    { day, period: 1, time: "08:00 - 08:45", subject: "2mat1", teacher: "MS. CURVE", room: "B102" },
    { day, period: 2, time: "08:50 - 09:35", subject: "2ph1", teacher: "", room: "Lab 1" },
    { day, period: 3, time: "09:55 - 10:40", subject: "2deu1", teacher: "", room: "C110" },
  ]},
  portal: {
    days: [{ date: tDe, weekday: "Fr", entries: [
      { date: tDe, weekday: "Fr", period: "2", substitute: "", course: "2ph1", room: "", info: "Entfall", cancelled: true },
      { date: tDe, weekday: "Fr", period: "3", substitute: "FRA. GRÜN", course: "2deu1", courseOld: "2DEU2", room: "R 210", info: "", cancelled: false },
    ]}],
    courses: ["2mat1", "2ph1", "2deu1"],
    stand: null,
  },
};

// structured rows — rowId = entity UUID, `deleted` tombstone, $-server fields
const row = (id, cols) => ({ $id: id, $createdAt: "2026-09-01T00:00:00.000+00:00", ...cols });
const TABLES = {
  subjects: [
    row("s1", { userId: USER, name: "Mathematics", color: "#3E6B4F", deleted: false }),
    row("s2", { userId: USER, name: "Physics", color: "#38618C", deleted: false }),
    row("s3", { userId: USER, name: "Old subject", color: "#666666", deleted: true }), // tombstone
  ],
  todos: [
    row("t1", { userId: USER, title: "Linear algebra sheet 4", subjectId: "s1", due: `${tKey}T17:00`, priority: "high", done: false, createdAt: 1, deleted: false }),
    row("t2", { userId: USER, title: "old finished thing", subjectId: "", due: `${tKey}T08:00`, priority: "low", done: true, createdAt: 2, deleted: false }),
    row("t3", { userId: USER, title: "way in the future", subjectId: "", due: "2027-01-01T09:00", priority: "low", done: false, createdAt: 3, deleted: false }),
  ],
  homeworks: [
    row("h1", { userId: USER, title: "Worksheet: quadratic equations", subjectId: "s2", due: `${tKey}T08:00`, priority: "medium", done: false, createdAt: 4, deleted: false }),
    // overdue by one day
    row("h2", { userId: USER, title: "Reading log", subjectId: "", due: `${yesterday}T12:00`, priority: "low", done: false, createdAt: 5, deleted: false }),
  ],
  events: [
    row("e1", { userId: USER, title: "Physics midterm", subjectId: "s2", date: inDays(3), time: "09:45", type: "exam", notes: "", deleted: false }),
    row("e2", { userId: USER, title: "far away", subjectId: "", date: "2027-05-01", time: "", type: "event", notes: "", deleted: false }),
  ],
};

const sent = [];
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.includes("/collections/snapshots/documents?")) {
    return { status: 200, ok: true, json: async () => ({ documents: [{ userId: USER }, { userId: USER }] }) };
  }
  const doc = u.match(/\/documents\/([0-9a-f]{32})$/);
  if (doc && options.method !== "POST") {
    for (const [key, payload] of Object.entries(SNAPSHOTS)) {
      if (doc[1] === docId(key)) return { status: 200, ok: true, json: async () => ({ data: JSON.stringify(payload) }) };
    }
    return { status: 404, ok: false, statusText: "not_found" };
  }
  const table = u.match(/\/tablesdb\/([^/]+)\/tables\/([^/]+)\/rows/);
  if (table) {
    return { status: 200, ok: true, json: async () => ({ total: TABLES[table[2]].length, rows: TABLES[table[2]] }) };
  }
  if (u.endsWith("/messaging/messages/push")) {
    sent.push(JSON.parse(options.body));
    return { status: 201, ok: true, json: async () => ({}) };
  }
  return { status: 404, ok: false, json: async () => ({}) };
};

const res = await handler({
  req: {},
  res: { json: (body, status) => ({ body, status }) },
  log: console.log,
  error: console.error,
});
console.log("\n=== RESULT ===");
console.log(JSON.stringify(res.body, null, 2));
console.log("\n=== PUSHES ===");
for (const p of sent) {
  console.log(`\n[${p.title}]\n${p.body}\n(users: ${p.users.join(",")}, id: ${p.messageId})`);
}
