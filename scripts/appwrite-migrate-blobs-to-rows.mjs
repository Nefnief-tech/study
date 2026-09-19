/**
 * One-time migration: reads the legacy snapshot blobs (subjects/todos/
 * homeworks/grades/events) for a user and writes each entity as a structured
 * row into the new tables. Row ids = the entity UUIDs.
 *
 * Usage:
 *   APPWRITE_PROJECT_ID=… APPWRITE_API_KEY=… USER_ID=… node scripts/appwrite-migrate-blobs-to-rows.mjs
 */

const ENDPOINT = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/+$/, "");
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const USER_ID = process.env.USER_ID;
const DATABASE_ID = "semester";

if (!PROJECT_ID || !API_KEY || !USER_ID) {
  console.error("Set APPWRITE_PROJECT_ID, APPWRITE_API_KEY and USER_ID.");
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${ENDPOINT}${path}`, {
    method,
    headers: {
      "X-Appwrite-Project": PROJECT_ID,
      "X-Appwrite-Key": API_KEY,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const sha256hex = async (s) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const snapshotDocId = (key) => sha256hex(`${USER_ID}:snapshots:${key}`).then((h) => h.slice(0, 32));

async function readSnapshot(key) {
  const id = await snapshotDocId(key);
  try {
    const doc = await api("GET", `/databases/${DATABASE_ID}/collections/snapshots/documents/${id}`);
    return JSON.parse(doc.data ?? "{}");
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function upsertRow(table, rowId, data) {
  try {
    await api("PATCH", `/tablesdb/${DATABASE_ID}/tables/${table}/rows/${rowId}`, { data });
    return "updated";
  } catch (e) {
    if (e.status !== 404) throw e;
    await api("POST", `/tablesdb/${DATABASE_ID}/tables/${table}/rows`, {
      rowId,
      data,
      permissions: [`read("user:${USER_ID}")`, `write("user:${USER_ID}")`],
    });
    return "created";
  }
}

async function main() {
  const blobs = {
    subjects: await readSnapshot("subjects"),
    todos: await readSnapshot("todos"),
    homeworks: await readSnapshot("homework"),
    grades: await readSnapshot("grades"),
    events: await readSnapshot("events"),
  };

  const plans = [
    ["subjects", blobs.subjects?.subjects ?? [], (s) => ({ userId: USER_ID, name: s.name, color: s.color, deleted: false })],
    ["todos", blobs.todos?.todos ?? [], (t) => ({
      userId: USER_ID, title: t.title, notes: t.notes ?? "", due: t.due ?? "",
      priority: t.priority, subjectId: t.subjectId ?? "", done: !!t.done,
      createdAt: t.createdAt ?? 0, deleted: false,
    })],
    ["homeworks", blobs.homeworks?.homeworks ?? [], (h) => ({
      userId: USER_ID, title: h.title, notes: h.notes ?? "", due: h.due ?? "",
      priority: h.priority, subjectId: h.subjectId ?? "", done: !!h.done,
      createdAt: h.createdAt ?? 0, deleted: false,
    })],
    ["grades", blobs.grades?.entries ?? [], (g) => ({
      userId: USER_ID, subjectId: g.subjectId ?? "", title: g.title,
      points: Math.round(g.points ?? 0), weight: Number(g.weight ?? 1), date: g.date ?? "",
      deleted: false,
    })],
    ["events", blobs.events?.events ?? [], (e) => ({
      userId: USER_ID, title: e.title, date: e.date, time: e.time ?? "",
      type: e.type, subjectId: e.subjectId ?? "", notes: e.notes ?? "", deleted: false,
    })],
  ];

  let total = 0;
  for (const [table, rows, map] of plans) {
    for (const entity of rows) {
      const rowId = entity.id;
      const data = map(entity);
      const how = await upsertRow(table, rowId, data);
      total++;
      console.log(`${table}/${rowId.slice(0, 8)} ${how}`);
    }
  }
  console.log(`\n${total} rows migrated.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
