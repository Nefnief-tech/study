// Local test harness for functions/weekly-digest — stubs fetch, feeds fake
// structured rows (exam, homework, task next week) and prints the pushes.
// Run: APPWRITE_API_KEY=mock node test/mock-run.mjs
import handler from "../src/main.js";

const USER = "11111111-2222-3333-4444-555555555555";
const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const row = (id, cols) => ({ $id: id, ...cols });

const TABLES = {
  subjects: [row("s1", { userId: USER, name: "Physics", deleted: false })],
  events: [
    row("e1", { userId: USER, title: "Midterm", subjectId: "s1", date: inDays(3), time: "09:45", type: "exam", deleted: false }),
    row("e2", { userId: USER, title: "Far away", subjectId: "", date: inDays(30), time: "", type: "event", deleted: false }),
  ],
  homeworks: [
    row("h1", { userId: USER, title: "Problem set 5", subjectId: "s1", due: `${inDays(2)}T17:00`, done: false, deleted: false }),
    row("h2", { userId: USER, title: "Done one", subjectId: "s1", due: `${inDays(1)}`, done: true, deleted: false }),
  ],
  todos: [
    row("t1", { userId: USER, title: "Register for retake", subjectId: "", due: `${inDays(5)}`, done: false, deleted: false }),
  ],
};

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  const table = u.match(/\/tablesdb\/semester\/tables\/([^/]+)\/rows/);
  if (table) {
    const rows = (TABLES[table[1]] ?? []).filter((r) => !u.includes(USER) || r.userId === USER);
    return { status: 200, ok: true, json: async () => ({ total: rows.length, rows }) };
  }
  if (u.includes("/messaging/messages/push")) {
    const body = JSON.parse(options.body ?? "{}");
    console.log(`PUSH ${body.title}\n${body.body}\n`);
    return { status: 201, ok: true, json: async () => ({}) };
  }
  return { status: 404, ok: false, json: async () => ({}) };
};

process.env.APPWRITE_API_KEY ||= "mock";
await handler({ req: {}, res: { json: (b) => console.log("RESPONSE:", JSON.stringify(b)) }, log: (m) => console.log("LOG:", m), error: (m) => console.error("ERR:", m) });
