/**
 * One-time migration: legacy JSON snapshot documents → structured table rows.
 *
 * Copies (never deletes — the old collections stay until you clean them up):
 *   snapshots(timetable) → timetable_entries rows
 *   snapshots(studyroom) → study_selection rows
 *   snapshots(portal)    → portal_entries + portal_courses rows
 *   chats(messages)      → chat_messages rows
 *   decks(docs)          → decks + flashcards rows
 * subjects/todos/homeworks/grades/events were migrated by
 * appwrite-migrate-blobs-to-rows.mjs.
 *
 * Usage:  APPWRITE_PROJECT_ID=… APPWRITE_API_KEY=… node scripts/appwrite-migrate-documents-to-rows.mjs
 */

const ENDPOINT = (process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1").replace(/\/+$/, "");
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.API_KEY || process.env.APPWRITE_API_KEY;
const DATABASE_ID = "semester";
const SNAPSHOTS = "snapshots";
const CHATS = "chats";
const DECKS = "decks";

if (!PROJECT_ID || !API_KEY) {
  console.error("Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY.");
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
  if (!res.ok && res.status !== 404) {
    const err = new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.ok ? json : null;
}

/** deterministic content hash (matches hashId() in both clients) */
function hashId(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

/** list every row/doc of a table/collection (paginated) */
async function listAll(path, label) {
  const out = [];
  let cursor = null;
  for (;;) {
    const queries = [{ method: "limit", values: [100] }];
    if (cursor) queries.push({ method: "cursorAfter", values: [cursor] });
    const params = new URLSearchParams();
    queries.forEach((q, i) => params.append(`queries[${i}]`, JSON.stringify(q)));
    const res = await api("GET", `${path}?${params.toString()}`);
    const items = res?.rows ?? res?.documents ?? [];
    out.push(...items);
    if (items.length < 100) break;
    cursor = items[items.length - 1].$id;
  }
  console.log(`  ${label}: ${out.length}`);
  return out;
}

async function upsertRow(table, rowId, data, permissions) {
  const res = await api("PATCH", `/tablesdb/${DATABASE_ID}/tables/${table}/rows/${rowId}`, { data });
  if (res) return "updated";
  await api("POST", `/tablesdb/${DATABASE_ID}/tables/${table}/rows`, {
    rowId,
    data,
    permissions,
  });
  return "created";
}

async function main() {
  // 1. every snapshot document (timetable / studyroom / portal)
  const snapshots = await listAll(`/databases/${DATABASE_ID}/collections/${SNAPSHOTS}/documents`, "snapshot docs");
  let tt = 0, sel = 0, pe = 0, pc = 0;
  for (const doc of snapshots) {
    const userId = doc.userId;
    if (!userId || typeof doc.data !== "string") continue;
    let parsed;
    try { parsed = JSON.parse(doc.data); } catch { continue; }
    const perms = [`read("user:${userId}")`, `write("user:${userId}")`];

    if (doc.key === "timetable" && Array.isArray(parsed.entries)) {
      const seen = new Set();
      for (const e of parsed.entries) {
        const rowId = hashId([e.day, e.period, e.time ?? "", e.subject, e.teacher ?? "", e.room ?? ""].join("|"));
        if (seen.has(rowId)) continue;
        seen.add(rowId);
        await upsertRow("timetable_entries", rowId, {
          userId, day: e.day ?? "Mon", period: e.period ?? 1,
          time: e.time ?? "", subject: e.subject ?? "",
          teacher: e.teacher ?? "", room: e.room ?? "", deleted: false,
        }, perms);
        tt++;
      }
    }

    if (doc.key === "studyroom" && Array.isArray(parsed.selectedDocIds)) {
      const seen = new Set();
      for (const docId of parsed.selectedDocIds) {
        const rowId = hashId(`sel|${docId}`);
        if (seen.has(rowId)) continue;
        seen.add(rowId);
        await upsertRow("study_selection", rowId, { userId, documentId: String(docId), deleted: false }, perms);
        sel++;
      }
    }

    if (doc.key === "portal") {
      for (const day of parsed.days ?? []) {
        const seen = new Set();
        for (const e of day.entries ?? []) {
          const sub = { ...e, cancelled: e.cancelled === true };
          const rowId = hashId([sub.date, sub.weekday, sub.period, sub.course, sub.courseOld ?? "", sub.substitute, sub.room, sub.info, String(sub.cancelled)].join("|"));
          if (seen.has(rowId)) continue;
          seen.add(rowId);
          await upsertRow("portal_entries", rowId, {
            userId, date: sub.date ?? "", weekday: sub.weekday ?? "", period: sub.period ?? "",
            course: sub.course ?? "", courseOld: sub.courseOld ?? "", substitute: sub.substitute ?? "",
            room: sub.room ?? "", info: sub.info ?? "", cancelled: sub.cancelled, deleted: false,
          }, perms);
          pe++;
        }
      }
      const seenC = new Set();
      for (const course of parsed.courses ?? []) {
        const rowId = hashId(`course|${course}`);
        if (seenC.has(rowId)) continue;
        seenC.add(rowId);
        await upsertRow("portal_courses", rowId, { userId, course, deleted: false }, perms);
        pc++;
      }
    }
  }

  // 2. chat messages
  const chatDocs = await listAll(`/databases/${DATABASE_ID}/collections/${CHATS}/documents`, "chat docs");
  let cm = 0;
  for (const doc of chatDocs) {
    const userId = doc.userId;
    if (!userId || typeof doc.messages !== "string") continue;
    let list;
    try { list = JSON.parse(doc.messages); } catch { continue; }
    const perms = [`read("user:${userId}")`, `write("user:${userId}")`];
    for (const [i, m] of (Array.isArray(list) ? list : []).entries()) {
      const rowId = hashId(`${userId}:${i}:${m.role}:${m.content}`);
      await upsertRow("chat_messages", rowId, {
        userId, role: m.role === "user" ? "user" : "assistant",
        content: m.content ?? "",
        sources: JSON.stringify(Array.isArray(m.sources) ? m.sources : []),
        sentAt: (doc.updatedAt ?? Date.now()) - (list.length - i) * 1000,
        deleted: false,
      }, perms);
      cm++;
    }
  }

  // 3. decks + flashcards
  const deckDocs = await listAll(`/databases/${DATABASE_ID}/collections/${DECKS}/documents`, "deck docs");
  let dk = 0, fc = 0;
  for (const doc of deckDocs) {
    const userId = doc.userId;
    if (!userId || !doc.deckId) continue;
    const perms = [`read("user:${userId}")`, `write("user:${userId}")`];
    let documentIds = [], cards = [];
    try { documentIds = JSON.parse(doc.documentIds ?? "[]"); } catch {}
    try { cards = JSON.parse(doc.cards ?? "[]"); } catch {}
    await upsertRow("decks", doc.$id, {
      userId, title: doc.title ?? "Deck", documentIds: JSON.stringify(documentIds),
      createdAt: doc.createdAt ?? 0, updatedAt: doc.updatedAt ?? 0, deleted: false,
    }, perms);
    dk++;
    for (const card of cards) {
      if (!card.id) continue;
      await upsertRow("flashcards", card.id, {
        userId, deckId: doc.deckId, front: card.front ?? "", back: card.back ?? "", deleted: false,
      }, perms);
      fc++;
    }
  }

  console.log(`\nmigrated: timetable_entries=${tt} study_selection=${sel} portal_entries=${pe} portal_courses=${pc} chat_messages=${cm} decks=${dk} flashcards=${fc}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
