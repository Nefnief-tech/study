// Local test harness for functions/homework-update — stubs fetch, feeds fake
// structured table rows (overdue, due today, added today) and prints the
// generated pushes. Run: APPWRITE_API_KEY=mock node test/mock-run.mjs
import handler from "../src/main.js";

const USER = "11111111-2222-3333-4444-555555555555";
const now = new Date();
const inDays = (n) => {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const today = inDays(0);
const row = (id, cols) => ({ $id: id, ...cols });

const TABLES = {
  subjects: [row("s1", { userId: USER, name: "Mathematics", deleted: false })],
  homeworks: [
    row("h1", { userId: USER, title: "Overdue worksheet", subjectId: "s1", due: `${inDays(-1)}T12:00`, done: false, deleted: false, createdAt: 1 }),
    row("h2", { userId: USER, title: "Due tonight", subjectId: "s1", due: `${today}T22:00`, done: false, deleted: false, createdAt: 2 }),
    row("h3", { userId: USER, title: "Fresh from today", subjectId: "s1", due: `${inDays(3)}`, done: false, deleted: false, createdAt: Date.now() }),
    row("h4", { userId: USER, title: "Done already", subjectId: "s1", due: `${today}T10:00`, done: true, deleted: false, createdAt: Date.now() }),
    row("h5", { userId: USER, title: "Tombstoned", subjectId: "s1", due: `${today}T09:00`, done: false, deleted: true, createdAt: 3 }),
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
    console.log(`PUSH [${body.users?.[0]?.slice(0, 8)}…] ${body.title}\n${body.body}\n`);
    return { status: 201, ok: true, json: async () => ({}) };
  }
  return { status: 404, ok: false, json: async () => ({}) };
};

process.env.APPWRITE_API_KEY ||= "mock";
await handler({ req: {}, res: { json: (b) => console.log("RESPONSE:", JSON.stringify(b)) }, log: (m) => console.log("LOG:", m), error: (m) => console.error("ERR:", m) });
