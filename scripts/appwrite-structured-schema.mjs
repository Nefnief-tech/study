/**
 * Creates the structured row tables for the Semester app in the existing
 * `semester` database (alongside the legacy collections — nothing is deleted).
 *
 * Usage:  APPWRITE_PROJECT_ID=… APPWRITE_API_KEY=… node scripts/appwrite-structured-schema.mjs
 *
 * Tables: subjects · todos · homeworks · grades · events
 * Each row = one entity; documentId = the client-side UUID.
 * Every row carries userId; row security is enabled so users only see their own rows.
 */

const ENDPOINT = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/+$/, "");
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = "semester";

if (!PROJECT_ID || !API_KEY) {
  console.error("Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY (key needs tablesdb scopes).");
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
    err.body = json;
    throw err;
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntilReady(tableId) {
  for (let i = 0; i < 60; i++) {
    const table = await api("GET", `/tablesdb/${DATABASE_ID}/tables/${tableId}`);
    const columns = table.columns ?? [];
    if (columns.length > 0 && columns.every((c) => c.status === "available")) return;
    await sleep(1500);
  }
  throw new Error(`columns of ${tableId} did not become available in time`);
}

const TABLES = [
  {
    id: "subjects",
    name: "Subjects",
    columns: [
      { type: "string", key: "userId", size: 64, required: true },
      { type: "string", key: "name", size: 128, required: true },
      { type: "string", key: "color", size: 16, required: true },
      { type: "boolean", key: "deleted", required: false, default: false },
    ],
  },
  {
    id: "todos",
    name: "Todos",
    columns: [
      { type: "string", key: "userId", size: 64, required: true },
      { type: "string", key: "title", size: 256, required: true },
      { type: "string", key: "notes", size: 4000, required: false },
      { type: "string", key: "due", size: 32, required: false },
      { type: "string", key: "priority", size: 16, required: false, default: "medium" },
      { type: "string", key: "subjectId", size: 64, required: false },
      { type: "boolean", key: "done", required: false, default: false },
      { type: "integer", key: "createdAt", required: true, min: 0, max: 9_000_000_000_000 },
      { type: "boolean", key: "deleted", required: false, default: false },
    ],
  },
  {
    id: "homeworks",
    name: "Homeworks",
    columns: [
      { type: "string", key: "userId", size: 64, required: true },
      { type: "string", key: "title", size: 256, required: true },
      { type: "string", key: "notes", size: 4000, required: false },
      { type: "string", key: "due", size: 32, required: false },
      { type: "string", key: "priority", size: 16, required: false, default: "medium" },
      { type: "string", key: "subjectId", size: 64, required: false },
      { type: "boolean", key: "done", required: false, default: false },
      { type: "integer", key: "createdAt", required: true, min: 0, max: 9_000_000_000_000 },
      { type: "boolean", key: "deleted", required: false, default: false },
    ],
  },
  {
    id: "grades",
    name: "Grades",
    columns: [
      { type: "string", key: "userId", size: 64, required: true },
      { type: "string", key: "subjectId", size: 64, required: false },
      { type: "string", key: "title", size: 256, required: true },
      { type: "integer", key: "points", required: true, min: 0, max: 15 },
      { type: "float", key: "weight", required: true, min: 0, max: 1_000_000 },
      { type: "string", key: "date", size: 16, required: false },
      { type: "boolean", key: "deleted", required: false, default: false },
    ],
  },
  {
    id: "events",
    name: "Events",
    columns: [
      { type: "string", key: "userId", size: 64, required: true },
      { type: "string", key: "title", size: 256, required: true },
      { type: "string", key: "date", size: 16, required: true },
      { type: "string", key: "time", size: 8, required: false },
      { type: "string", key: "type", size: 16, required: false, default: "event" },
      { type: "string", key: "subjectId", size: 64, required: false },
      { type: "string", key: "notes", size: 4000, required: false },
      { type: "boolean", key: "deleted", required: false, default: false },
    ],
  },
];

const tableBase = `/tablesdb/${DATABASE_ID}/tables`;

async function main() {
  for (const table of TABLES) {
    // create table (idempotent-ish: skip when it already exists)
    try {
      await api("GET", `${tableBase}/${table.id}`);
      console.log(`table ${table.id} already exists — verifying columns`);
    } catch (e) {
      if (e.status !== 404) throw e;
      await api("POST", tableBase, {
        tableId: table.id,
        name: table.name,
        permissions: ['create("users")'],
        rowSecurity: true,
      });
      console.log(`table ${table.id} created`);
    }

    // create missing columns
    const existing = await api("GET", `${tableBase}/${table.id}`);
    const have = new Set((existing.columns ?? []).map((c) => c.key));
    for (const col of table.columns) {
      if (have.has(col.key)) continue;
      const path = `${tableBase}/${table.id}/columns/${col.type}`;
      const body = { key: col.key, required: col.required ?? false };
      if (col.type === "string") { body.size = col.size; if (col.default !== undefined) body.default = col.default; }
      if (col.type === "boolean") { if (col.default !== undefined) body.default = col.default; }
      if (col.type === "integer") { body.min = col.min ?? 0; body.max = col.max ?? 9_000_000_000_000; if (col.default !== undefined) body.default = col.default; }
      if (col.type === "float") { body.min = col.min ?? 0; body.max = col.max ?? 1_000_000; if (col.default !== undefined) body.default = col.default; }
      await api("POST", path, body);
      console.log(`  column ${col.key} (${col.type}) created`);
    }

    await waitUntilReady(table.id);

    // create the userId index if missing
    const table2 = await api("GET", `${tableBase}/${table.id}`);
    const hasIndex = (table2.indexes ?? []).some((ix) => ix.attributes?.length === 1 && ix.attributes[0] === "userId");
    if (!hasIndex) {
      try {
        await api("POST", `${tableBase}/${table.id}/indexes`, {
          key: "userId_idx",
          type: "key",
          columns: ["userId"],
        });
        console.log(`  index userId_idx created`);
      } catch (e) {
        if (e.status !== 409) throw e;
        console.log(`  index userId_idx already exists`);
      }
    }
    console.log(`table ${table.id} ready ✓`);
  }
  console.log("\nAll structured tables are ready.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
