// Local test harness for functions/daily-digest — stubs fetch, feeds fake
// snapshots (incl. a cancelled class) and prints the generated pushes.
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

const DATA = {
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
  subjects: { subjects: [
    { id: "s1", name: "Mathematics", color: "#3E6B4F" },
    { id: "s2", name: "Physics", color: "#38618C" },
  ]},
  todos: { todos: [
    { id: "t1", title: "Linear algebra sheet 4", subjectId: "s1", due: `${tKey}T17:00`, priority: "high", done: false, createdAt: 1 },
    { id: "t2", title: "old finished thing", done: true, due: `${tKey}T08:00`, priority: "low", createdAt: 2 },
    { id: "t3", title: "way in the future", due: "2027-01-01T09:00", priority: "low", done: false, createdAt: 3 },
  ]},
  homework: { homeworks: [
    { id: "h1", title: "Worksheet: quadratic equations", subjectId: "s2", due: `${tKey}T08:00`, priority: "medium", done: false, createdAt: 4 },
    // overdue by one day
    { id: "h2", title: "Reading log", due: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T12:00`; })(), priority: "low", done: false, createdAt: 5 },
  ]},
  events: { events: [
    { id: "e1", title: "Physics midterm", date: (() => { const d = new Date(); d.setDate(d.getDate() + 3); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })(), time: "09:45", type: "exam", subjectId: "s2" },
    { id: "e2", title: "far away", date: "2027-05-01", type: "event" },
  ]},
};

const sent = [];
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.includes("/documents?queries=")) {
    return { status: 200, ok: true, json: async () => ({ documents: [{ userId: USER }, { userId: USER }] }) };
  }
  const m = u.match(/\/documents\/([0-9a-f]{32})$/);
  if (m && options.method !== "POST") {
    for (const [key, payload] of Object.entries(DATA)) {
      if (m[1] === docId(key)) return { status: 200, ok: true, json: async () => ({ data: JSON.stringify(payload) }) };
    }
    return { status: 404, ok: false, statusText: "not_found" };
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
