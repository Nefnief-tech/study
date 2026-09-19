import { ID } from "appwrite";
import {
  CHATS_COLLECTION_ID,
  DATABASE_ID,
  DECKS_COLLECTION_ID,
  SNAPSHOTS_COLLECTION_ID,
  account,
  appwriteClient,
  appwriteConfigured,
  getCurrentUser,
  getAuthHeaders,
  type AuthUser,
} from "./appwrite";
import { useAuthStore, useSyncMetaStore } from "@/lib/store/auth";
import { useSubjectsStore } from "@/lib/store/subjects";
import { useTodosStore } from "@/lib/store/todos";
import { useGradesStore, normalizeGradeEntries } from "@/lib/store/grades";
import { useEventsStore } from "@/lib/store/events";
import { useHomeworkStore } from "@/lib/store/homework";
import { useTimetableStore } from "@/lib/store/timetable";
import { useStudyRoomStore } from "@/lib/store/studyroom";
import type { Deck, GradeEntry, Homework, StudyEvent, Subject, Todo } from "@/lib/types";
import type { PortalSub } from "../server/portal";

/** shape returned by /api/portal/fetch (see timetable page) */
export interface PortalPlanJson {
  days: Array<{ date: string; weekday: string; entries: PortalSub[] }>;
  courses: string[];
  stand: string | null;
}

/**
 * Sync model, two layers:
 *
 * 1. ROW COLLECTIONS (subjects/todos/homeworks/grades/events — Appwrite
 *    tables, one row per entity, rowId = the entity UUID):
 *      push  = diff the local store against the last-synced row digests and
 *              upsert changed rows / soft-delete (deleted=true) removed rows
 *      pull  = fetch all rows of the user and merge — rows with pending local
 *              edits win, remote rows otherwise, deleted rows remove locally
 *      realtime = single-row events through the same merge
 *    A device can therefore never wipe data it hasn't seen: it only touches
 *    rows it actually changed.
 *
 * 2. BLOBS (timetable / studyroom / chats / decks / portal — wholesale-
 *    replaced by design): cloud-wins-on-load with the dirty-baseline rule,
 *    debounced push, exactly as before.
 */

const PUSH_DEBOUNCE_MS = 1200;
const MAX_CHAT_MESSAGES = 120;

/** REST base for row calls (the Dart/JS SDK models are bypassed — see git) */
const REST_BASE = "https://fra.cloud.appwrite.io/v1";

async function snapshotDocId(userId: string, collection: string, key: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${userId}:${collection}:${key}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/* ================================================================== */
/* ROW COLLECTIONS                                                     */
/* ================================================================== */

type RowData = Record<string, unknown>;

interface RowStoreDef {
  table: string;
  list: () => Array<{ id: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertOne: (entity: any) => void;
  removeOne: (id: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toRow: (entity: any) => RowData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fromRow: (row: RowData) => any;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const bool = (v: unknown) => v === true;

const ROW_STORES: Record<string, RowStoreDef> = {
  subjects: {
    table: "subjects",
    list: () => useSubjectsStore.getState().subjects,
    upsertOne: (s) => useSubjectsStore.getState().upsertOne(s),
    removeOne: (id) => useSubjectsStore.getState().removeOne(id),
    toRow: (s) => {
      const subject = s as Subject;
      return { name: subject.name, color: subject.color, deleted: false };
    },
    fromRow: (row) =>
      ({
        id: String(row.$id),
        name: str(row.name),
        color: str(row.color) || "#3E6B4F",
      }) as unknown as Subject,
  },
  todos: {
    table: "todos",
    list: () => useTodosStore.getState().todos,
    upsertOne: (t) => useTodosStore.getState().upsertOne(t),
    removeOne: (id) => useTodosStore.getState().removeOne(id),
    toRow: (t) => {
      const todo = t as Todo;
      return {
        title: todo.title,
        notes: todo.notes ?? "",
        due: todo.due ?? "",
        priority: todo.priority,
        subjectId: todo.subjectId ?? "",
        done: todo.done,
        createdAt: todo.createdAt,
        deleted: false,
      };
    },
    fromRow: (row) =>
      ({
        id: String(row.$id),
        title: str(row.title),
        notes: str(row.notes) || undefined,
        due: str(row.due) || undefined,
        priority: (str(row.priority) || "medium") as Todo["priority"],
        subjectId: str(row.subjectId) || undefined,
        done: bool(row.done),
        createdAt: num(row.createdAt),
      }) as unknown as Todo,
  },
  homework: {
    table: "homeworks",
    list: () => useHomeworkStore.getState().homeworks,
    upsertOne: (h) => useHomeworkStore.getState().upsertOne(h),
    removeOne: (id) => useHomeworkStore.getState().removeOne(id),
    toRow: (h) => {
      const hw = h as Homework;
      return {
        title: hw.title,
        notes: hw.notes ?? "",
        due: hw.due ?? "",
        priority: hw.priority,
        subjectId: hw.subjectId ?? "",
        done: hw.done,
        createdAt: hw.createdAt,
        deleted: false,
      };
    },
    fromRow: (row) =>
      ({
        id: String(row.$id),
        title: str(row.title),
        notes: str(row.notes) || undefined,
        due: str(row.due) || undefined,
        priority: (str(row.priority) || "medium") as Homework["priority"],
        subjectId: str(row.subjectId) || undefined,
        done: bool(row.done),
        createdAt: num(row.createdAt),
      }) as unknown as Homework,
  },
  grades: {
    table: "grades",
    list: () => useGradesStore.getState().entries,
    upsertOne: (g) => useGradesStore.getState().upsertOne(g),
    removeOne: (id) => useGradesStore.getState().removeOne(id),
    toRow: (g) => {
      const entry = g as GradeEntry;
      return {
        subjectId: entry.subjectId ?? "",
        title: entry.title,
        points: Math.round(entry.points),
        weight: Number(entry.weight),
        date: entry.date ?? "",
        deleted: false,
      };
    },
    fromRow: (row) =>
      ({
        id: String(row.$id),
        subjectId: str(row.subjectId) || undefined,
        title: str(row.title),
        points: num(row.points),
        weight: num(row.weight) || 1,
        date: str(row.date) || undefined,
      }) as unknown as GradeEntry,
  },
  events: {
    table: "events",
    list: () => useEventsStore.getState().events,
    upsertOne: (e) => useEventsStore.getState().upsertOne(e),
    removeOne: (id) => useEventsStore.getState().removeOne(id),
    toRow: (e) => {
      const event = e as StudyEvent;
      return {
        title: event.title,
        date: event.date,
        time: event.time ?? "",
        type: event.type,
        subjectId: event.subjectId ?? "",
        notes: event.notes ?? "",
        deleted: false,
      };
    },
    fromRow: (row) =>
      ({
        id: String(row.$id),
        title: str(row.title),
        date: str(row.date),
        time: str(row.time) || undefined,
        type: (str(row.type) || "event") as StudyEvent["type"],
        subjectId: str(row.subjectId) || undefined,
        notes: str(row.notes) || undefined,
      }) as unknown as StudyEvent,
  },
};

const ROW_STORE_KEYS = Object.keys(ROW_STORES);

async function sha256hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function rowDigest(entity: { id: string }, def: RowStoreDef) {
  return sha256hex(JSON.stringify(def.toRow(entity)));
}

/* ---------------- row REST calls (JWT) ---------------- */

const rowsUri = (table: string, rowId?: string) =>
  `${REST_BASE}/databases/${DATABASE_ID}/tables/${table}/rows${rowId ? `/${rowId}` : ""}`;

async function restListRows(table: string, userId: string): Promise<Array<RowData & { $id: string }>> {
  const headers = await getAuthHeaders();
  const queries = JSON.stringify([`equal("userId","${userId}")`, "limit(100)"]);
  const res = await fetch(
    `${REST_BASE}/databases/${DATABASE_ID}/tables/${table}/rows?queries=${encodeURIComponent(queries)}`,
    { headers },
  );
  if (!res.ok) throw new Error(`list ${table} → ${res.status}`);
  const json = (await res.json()) as { rows?: Array<RowData & { $id: string }> };
  return json.rows ?? [];
}

async function restUpsertRow(table: string, rowId: string, data: RowData, userId: string) {
  const headers = { "content-type": "application/json", ...(await getAuthHeaders()) };
  let res = await fetch(rowsUri(table, rowId), {
    method: "PATCH",
    headers,
    body: JSON.stringify({ data }),
  });
  if (res.status === 404) {
    res = await fetch(rowsUri(table), {
      method: "POST",
      headers,
      body: JSON.stringify({
        rowId,
        data,
        permissions: [`read("user:${userId}")`, `write("user:${userId}")`],
      }),
    });
  }
  if (!res.ok) {
    throw new Error(`upsert ${table}/${rowId} → ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
}

async function restSoftDeleteRow(table: string, rowId: string) {
  const headers = { "content-type": "application/json", ...(await getAuthHeaders()) };
  const res = await fetch(rowsUri(table, rowId), {
    method: "PATCH",
    headers,
    body: JSON.stringify({ data: { deleted: true } }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete ${table}/${rowId} → ${res.status}`);
  }
}

/* ---------------- row push (diff) + pull (merge) ---------------- */

const rowPushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function scheduleRowSync(storeKey: string) {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user) return;
  clearTimeout(rowPushTimers[storeKey]);
  rowPushTimers[storeKey] = setTimeout(() => void syncRows(storeKey, user), PUSH_DEBOUNCE_MS);
}

/** diff local store vs last-synced digests → upserts + soft-deletes */
async function syncRows(storeKey: string, user: AuthUser) {
  const def = ROW_STORES[storeKey];
  const meta = useSyncMetaStore.getState();
  const digests = { ...(meta.rowDigests[storeKey] ?? {}) };

  const current = def.list();
  const currentDigests: Record<string, string> = {};
  for (const entity of current) {
    const digest = await rowDigest(entity, def);
    currentDigests[entity.id] = digest;
    if (digests[entity.id] !== digest) {
      await restUpsertRow(def.table, entity.id, def.toRow(entity), user.id);
    }
  }

  // rows the cloud knows that vanished locally → soft-delete
  for (const id of Object.keys(digests)) {
    if (currentDigests[id] === undefined) {
      await restSoftDeleteRow(def.table, id);
      delete digests[id];
    }
  }

  useSyncMetaStore.getState().setRowDigests(storeKey, digests);
}

/** merge pulled rows into a store; locally-changed rows win */
async function mergeRows(storeKey: string, rows: Array<RowData & { $id: string }>) {
  const def = ROW_STORES[storeKey];
  const digests = { ...(useSyncMetaStore.getState().rowDigests[storeKey] ?? {}) };
  const current = def.list();
  const byId = new Map(current.map((e) => [e.id, e]));

  for (const row of rows) {
    const id = String(row.$id);
    if (row.deleted === true) {
      if (byId.has(id)) def.removeOne(id);
      delete digests[id];
      continue;
    }
    const local = byId.get(id);
    if (local) {
      const localDigest = await rowDigest(local, def);
      if (localDigest !== digests[id]) continue; // pending local edit wins
    }
    const entity = def.fromRow(row);
    def.upsertOne(entity);
    digests[id] = await rowDigest(entity, def);
  }
  useSyncMetaStore.getState().setRowDigests(storeKey, digests);
}

async function pullRows(storeKey: string, user: AuthUser) {
  const def = ROW_STORES[storeKey];
  const rows = await restListRows(def.table, user.id);
  await mergeRows(storeKey, rows);
}

/** single realtime row event → same merge as a pull */
async function mergeRowEvent(storeKey: string, payload: RowData & { $id: string }) {
  await mergeRows(storeKey, [payload]);
}

/* ================================================================== */
/* BLOB STORES (timetable / studyroom / chats / decks)                 */
/* ================================================================== */

interface BlobOps {
  key: string;
  collection: string;
  read: () => Record<string, unknown>;
  apply: (doc: Record<string, unknown>) => void;
  isEmpty: () => boolean;
}

const BLOB_KEYS: Record<string, BlobOps> = {
  timetable: {
    key: "timetable",
    collection: SNAPSHOTS_COLLECTION_ID,
    read: () => ({ data: JSON.stringify({ entries: useTimetableStore.getState().entries }) }),
    apply: (doc) => {
      try {
        const parsed = JSON.parse((doc.data as string) ?? "{}");
        const list = Array.isArray(parsed.entries) ? parsed.entries : [];
        useTimetableStore.getState().replaceEntries(
          list.map((e: Record<string, unknown>) => ({
            day: String(e.day ?? "Mon"),
            period: Number(e.period ?? 1),
            time: typeof e.time === "string" ? e.time : undefined,
            subject: String(e.subject ?? ""),
            teacher: typeof e.teacher === "string" ? e.teacher : undefined,
            room: typeof e.room === "string" ? e.room : undefined,
          })),
        );
      } catch {
        // corrupted blob — keep the local timetable
      }
    },
    isEmpty: () => useTimetableStore.getState().entries.length === 0,
  },
  studyroom: {
    key: "studyroom",
    collection: SNAPSHOTS_COLLECTION_ID,
    read: () => {
      const room = useStudyRoomStore.getState();
      return {
        data: JSON.stringify({
          selectedDocIds: room.selectedDocIds,
          deckIds: room.decks.map((d) => d.id),
        }),
      };
    },
    apply: (doc) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse((doc.data as string) ?? "{}");
      } catch {
        return;
      }
      appliedDeckIds = Array.isArray(parsed.deckIds)
        ? parsed.deckIds.map((e) => String(e))
        : [];
      useStudyRoomStore.getState().replaceSelectedDocIds(
        Array.isArray(parsed.selectedDocIds)
          ? parsed.selectedDocIds.map((e) => String(e))
          : [],
      );
    },
    isEmpty: () => false,
  },
  chats: {
    key: "chats",
    collection: CHATS_COLLECTION_ID,
    read: () => ({
      messages: JSON.stringify(
        useStudyRoomStore.getState().chat.slice(-MAX_CHAT_MESSAGES).map((m) => ({ role: m.role, content: m.content, sources: m.sources })),
      ),
    }),
    apply: (doc) => {
      let list: Array<Record<string, unknown>> = [];
      try {
        list = JSON.parse((doc.messages as string) ?? "[]");
      } catch {
        return;
      }
      useStudyRoomStore.getState().replaceChat(
        list.map((m) => ({
          role: String(m.role ?? "assistant"),
          content: String(m.content ?? ""),
          sources: Array.isArray(m.sources) ? m.sources.map((e) => String(e)) : undefined,
        })),
      );
    },
    isEmpty: () => useStudyRoomStore.getState().chat.length === 0,
  },
};

const BLOB_KEYS_LIST = Object.keys(BLOB_KEYS);

function collectionFor(key: string) {
  return BLOB_KEYS[key]?.collection ?? SNAPSHOTS_COLLECTION_ID;
}

let applyingRemote = false;
let subscribed = false;
let appliedDeckIds: string[] | null = null;
const blobPushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/* ---------------- decks (one document per deck, as before) ---------------- */

function docToDeck(doc: Record<string, unknown>): Deck {
  let documentIds: string[] = [];
  let cards: Deck["cards"] = [];
  try {
    documentIds = JSON.parse((doc.documentIds as string) ?? "[]");
  } catch {}
  try {
    cards = JSON.parse((doc.cards as string) ?? "[]");
  } catch {}
  return {
    id: String(doc.deckId ?? ""),
    title: (doc.title as string) ?? "Deck",
    documentIds,
    createdAt: (doc.createdAt as number) ?? 0,
    updatedAt: (doc.updatedAt as number) ?? 0,
    cards,
  };
}

async function pushDeck(user: AuthUser, deck: Deck) {
  const docId = await snapshotDocId(user.id, DECKS_COLLECTION_ID, deck.id);
  const headers = { "content-type": "application/json", ...(await getAuthHeaders()) };
  const body = {
    data: {
      userId: user.id,
      deckId: deck.id,
      title: deck.title,
      documentIds: JSON.stringify(deck.documentIds),
      cards: JSON.stringify(deck.cards),
      createdAt: deck.createdAt,
      updatedAt: Date.now(),
    },
  };
  let res = await fetch(
    `${REST_BASE}/databases/${DATABASE_ID}/collections/${DECKS_COLLECTION_ID}/documents/${docId}`,
    { method: "PATCH", headers, body: JSON.stringify(body) },
  );
  if (res.status === 404) {
    res = await fetch(
      `${REST_BASE}/databases/${DATABASE_ID}/collections/${DECKS_COLLECTION_ID}/documents`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          documentId: docId,
          permissions: [`read("user:${user.id}")`, `write("user:${user.id}")`],
          data: body.data,
        }),
      },
    );
  }
  if (!res.ok) throw new Error(`deck upsert → ${res.status}`);
  lastDeckPush.set(docId, deck.updatedAt);
}

const lastDeckPush = new Map<string, number>();

async function syncDecks(user: AuthUser) {
  const room = useStudyRoomStore.getState();
  for (const deck of room.decks) {
    await pushDeck(user, deck);
  }
  // restore decks listed in the studyroom snapshot but missing locally
  for (const id of appliedDeckIds ?? []) {
    if (room.decks.some((d) => d.id === id)) continue;
    try {
      const docId = await snapshotDocId(user.id, DECKS_COLLECTION_ID, id);
      const headers = { "content-type": "application/json", ...(await getAuthHeaders()) };
      const res = await fetch(
        `${REST_BASE}/databases/${DATABASE_ID}/collections/${DECKS_COLLECTION_ID}/documents/${docId}`,
        { headers },
      );
      if (res.ok) {
        const doc = (await res.json()) as Record<string, unknown>;
        const deck = docToDeck({ ...doc, deckId: id });
        if (deck.id) useStudyRoomStore.getState().upsertDeck(deck);
      }
    } catch {
      // a missing deck stays missing
    }
  }
}

/* ================================================================== */
/* BLOB RECONCILE (observe + retry machinery)                          */
/* ================================================================== */

async function observeBlobKey(user: AuthUser, key: string): Promise<boolean> {
  const ops = BLOB_KEYS[key];
  let remote: Record<string, unknown> | null = null;
  let observedCloud = false; // 404 (empty cloud) counts as observed
  try {
    const docId = await snapshotDocId(user.id, collectionFor(key), key);
    const headers = { "content-type": "application/json", ...(await getAuthHeaders()) };
    const res = await fetch(
      `${REST_BASE}/databases/${DATABASE_ID}/collections/${collectionFor(key)}/documents/${docId}`,
      { headers },
    );
    if (res.status === 404) {
      observedCloud = true;
    } else if (res.ok) {
      remote = (await res.json()) as Record<string, unknown>;
      observedCloud = true;
    } else {
      observedCloud = false;
    }
  } catch {
    observedCloud = false; // offline etc. — cloud state unknown
  }
  if (observedCloud) useSyncMetaStore.getState().markLoaded(key);

  // …unless this device holds local edits that never made it up
  const dirtyAt = useSyncMetaStore.getState().dirtyAt[key];
  const remoteUpdatedAt = (remote?.updatedAt as number) ?? 0;
  const hasUnsyncedEdits =
    dirtyAt !== undefined && (remote === null || dirtyAt > remoteUpdatedAt);

  if (remote && !hasUnsyncedEdits) {
    ops.apply(remote);
    useSyncMetaStore.getState().clearDirty(key);
    return true;
  }
  if (!remote && ops.isEmpty()) return true;
  // write afterwards: unsynced edits, or fresh local data with no snapshot yet
  await pushBlobSnapshot(user, key);
  return true;
}

async function pushBlobSnapshot(user: AuthUser, key: string) {
  const ops = BLOB_KEYS[key];
  const { setSyncing } = useAuthStore.getState();
  setSyncing(true);
  try {
    const docId = await snapshotDocId(user.id, collectionFor(key), key);
    const updatedAt = Date.now();
    const attributes: Record<string, unknown> = {
      userId: user.id,
      ...ops.read(),
      updatedAt,
    };
    if (key !== "chats") attributes.key = key;

    // baseline rule: a device that has never observed this store's cloud state
    // must not push (it could wipe data it has never seen)
    if (key !== "chats" && !useSyncMetaStore.getState().isLoaded(key)) {
      setSyncing(false);
      return;
    }
    // second layer: never overwrite a non-empty blob with an empty one
    if (key !== "chats") {
      const headers = { "content-type": "application/json", ...(await getAuthHeaders()) };
      const res = await fetch(
        `${REST_BASE}/databases/${DATABASE_ID}/collections/${collectionFor(key)}/documents/${docId}`,
        { headers },
      );
      if (res.ok) {
        const remoteDoc = (await res.json()) as Record<string, unknown>;
        const remoteRaw = (remoteDoc.data as string) ?? "{}";
        let remoteParsed: Record<string, unknown> = {};
        try {
          remoteParsed = JSON.parse(remoteRaw);
        } catch {}
        const localParsed: Record<string, unknown> = JSON.parse(
          (attributes.data as string) ?? "{}",
        );
        const localEmpty = Object.values(localParsed).every(
          (v) => Array.isArray(v) && v.length === 0,
        );
        const remoteNonEmpty = Object.values(remoteParsed).some(
          (v) => Array.isArray(v) && v.length > 0,
        );
        if (localEmpty && remoteNonEmpty) {
          // keep the cloud copy; the next reconcile pulls it back
          useSyncMetaStore.getState().clearDirty(key);
          setSyncing(false);
          return;
        }
      }
    }

    const headers = { "content-type": "application/json", ...(await getAuthHeaders()) };
    const res = await fetch(
      `${REST_BASE}/databases/${DATABASE_ID}/collections/${collectionFor(key)}/documents/${docId}`,
      { method: "PATCH", headers, body: JSON.stringify({ data: attributes }) },
    );
    if (res.status === 404) {
      await fetch(
        `${REST_BASE}/databases/${DATABASE_ID}/collections/${collectionFor(key)}/documents`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            documentId: docId,
            permissions: [`read("user:${user.id}")`, `write("user:${user.id}")`],
            data: attributes,
          }),
        },
      );
    }
    useSyncMetaStore.getState().clearDirty(key);
    useAuthStore.getState().setSynced(Date.now());
  } catch (e) {
    setSyncing(false);
    useAuthStore.getState().setSyncError((e as Error).message);
  }
}

function scheduleBlobPush(key: string) {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user || applyingRemote) return;
  useSyncMetaStore.getState().markDirty(key, Date.now());
  clearTimeout(blobPushTimers[key]);
  blobPushTimers[key] = setTimeout(() => void pushBlobSnapshot(user, key), PUSH_DEBOUNCE_MS);
}

/* ================================================================== */
/* FULL SYNC (blobs + rows) with retry + serialization                 */
/* ================================================================== */


let reconcileInFlight: Promise<void> = Promise.resolve();
function reconcile(user: AuthUser): Promise<void> {
  reconcileInFlight = reconcileInFlight
    .then(() => runReconcile(user))
    .finally(() => {
      reconcileInFlight = Promise.resolve();
    });
  return reconcileInFlight;
}

async function runReconcile(user: AuthUser) {
  applyingRemote = true;
  const auth = useAuthStore.getState();
  try {
    // blobs: observe each with retries
    let remaining = BLOB_KEYS_LIST;
    for (let attempt = 0; attempt < 3 && remaining.length > 0; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      const failed: string[] = [];
      for (const key of remaining) {
        if (!(await observeBlobKey(user, key))) failed.push(key);
      }
      remaining = failed;
    }
    if (remaining.length > 0) {
      auth.setSyncError(
        `sync incomplete — ${remaining.join(", ")} could not be loaded; check your connection and tap Sync now`,
      );
      scheduleRetryLoop();
      return;
    }

    // rows: push + pull each store
    const failedRows: string[] = [];
    for (const key of ROW_STORE_KEYS) {
      try {
        await syncRows(key, user);
        await pullRows(key, user);
      } catch (e) {
        failedRows.push(key);
        console.warn(`[sync] row store ${key} failed:`, e);
      }
    }
    if (failedRows.length > 0) {
      auth.setSyncError(`sync incomplete — row stores failed: ${failedRows.join(", ")}`);
      scheduleRetryLoop();
      return;
    }

    await syncDecks(user);
    auth.setSynced(Date.now());
  } catch (e) {
    auth.setSyncError((e as Error).message);
  } finally {
    applyingRemote = false;
  }
}

let retryTimer: ReturnType<typeof setInterval> | undefined = undefined;

/** while the sync is incomplete, keep retrying every 30 s — flaky-DNS windows
 *  come and go, and the app should heal on its own without user action */
function scheduleRetryLoop() {
  if (retryTimer) return; // already looping
  retryTimer = setInterval(() => {
    const { status, syncError, user } = useAuthStore.getState();
    if (status !== "signed-in" || !syncError || !user) {
      clearInterval(retryTimer);
      retryTimer = undefined;
      return;
    }
    void reconcile(user);
  }, 30_000);
}

/** "Sync now" — full round-trip */
export async function syncNow() {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user) return;
  await reconcile(user);
}

/** called on resume / visibility-return */
export async function resync() {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user) return;
  await reconcile(user);
}

/* ================================================================== */
/* REALTIME                                                            */
/* ================================================================== */

let realtimeUnsub: Array<() => void> = [];

function startRealtime(user: AuthUser) {
  stopRealtime();
  if (!appwriteClient) return;
  const channels = [
    `databases.${DATABASE_ID}.collections.${SNAPSHOTS_COLLECTION_ID}.documents`,
    `databases.${DATABASE_ID}.collections.${CHATS_COLLECTION_ID}.documents`,
    `databases.${DATABASE_ID}.collections.${DECKS_COLLECTION_ID}.documents`,
    ...ROW_STORE_KEYS.map(
      (key) => `databases.${DATABASE_ID}.tables.${BLOB_KEYS ? ROW_TABLES[key] : ""}.rows`,
    ),
  ];
  const unsubs = [appwriteClient.subscribe(channels, (response) => {
    try {
      handleRealtimeEvent(
        response as { events: string[]; payload: Record<string, unknown> },
        user,
      );
    } catch {
      // a malformed event must never break the tab
    }
  })];
  realtimeUnsub = unsubs;
}

const ROW_TABLES: Record<string, string> = {
  subjects: "subjects",
  todos: "todos",
  homework: "homeworks",
  grades: "grades",
  events: "events",
};

function stopRealtime() {
  for (const unsub of realtimeUnsub) unsub();
  realtimeUnsub = [];
}

function handleRealtimeEvent(
  response: { events: string[]; payload: Record<string, unknown> },
  user: AuthUser,
) {
  const { user: currentUser, status } = useAuthStore.getState();
  if (status !== "signed-in" || currentUser?.id !== user.id) return;
  const event = response.events[0] ?? "";
  const payload = response.payload;

  // row events: databases.{db}.tables.{table}/rows/...
  if (event.includes("/tables/")) {
    for (const [storeKey, table] of Object.entries(ROW_TABLES)) {
      if (event.includes(`/tables/${table}/rows`)) {
        void mergeRowEvent(storeKey, { ...payload, $id: String(payload.$id ?? "") });
        return;
      }
    }
    return;
  }

  // deck events
  if (event.includes(`/collections/${DECKS_COLLECTION_ID}/documents`)) {
    if (payload.deleted === true || event.endsWith(".delete")) {
      const deckId = payload.deckId;
      if (typeof deckId === "string") useStudyRoomStore.getState().removeDeckSilently(deckId);
      return;
    }
    const deck = docToDeck(payload);
    if (deck.id) useStudyRoomStore.getState().upsertDeck(deck);
    return;
  }

  // blob document events (timetable / studyroom / chats)
  const key = payload.key;
  if (typeof key === "string" && BLOB_KEYS[key]) {
    if (event.endsWith(".delete")) return;
    applyingRemote = true;
    try {
      BLOB_KEYS[key].apply(payload);
    } finally {
      applyingRemote = false;
    }
  }
}

/* ================================================================== */
/* SUBSCRIPTIONS + INIT/AUTH                                           */
/* ================================================================== */

function subscribeStores() {
  if (subscribed) return;
  subscribed = true;

  // blobs
  useTimetableStore.subscribe(() => scheduleBlobPush("timetable"));
  useStudyRoomStore.subscribe(() => scheduleBlobPush("studyroom"));
  useStudyRoomStore.subscribe(() => {
    const { user, status } = useAuthStore.getState();
    if (status !== "signed-in" || !user || applyingRemote) return;
    void syncDecks(user);
  });

  // rows
  useSubjectsStore.subscribe(() => scheduleRowSync("subjects"));
  useTodosStore.subscribe(() => scheduleRowSync("todos"));
  useHomeworkStore.subscribe(() => scheduleRowSync("homework"));
  useGradesStore.subscribe(() => scheduleRowSync("grades"));
  useEventsStore.subscribe(() => scheduleRowSync("events"));
}

/* ---------------- session persistence ----------------
 * The Dart/JS SDKs keep sessions alive in the browser, but the mobile cookie
 * jar is memory-only — so the secret is persisted device-local at sign-in and
 * restored on startup (same trust level as the browser cookie). */

const SESSION_KEY = "semester.appwritesession";

async function persistSession(secret: string) {
  try {
    localStorage.setItem(SESSION_KEY, secret);
  } catch {}
}

async function loadSessionSecret(): Promise<string | null> {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

async function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

/** restores the Appwrite session (if any) and reconciles — run once on mount */
export async function initSync() {
  const { setAuth, setOnline } = useAuthStore.getState();
  if (!appwriteConfigured || !account || !appwriteClient) {
    setAuth(null, "unconfigured");
    return;
  }
  setAuth(null, "loading");

  const updateOnline = () => setOnline(navigator.onLine);
  updateOnline();
  window.addEventListener("online", () => {
    updateOnline();
    void resync();
  });
  window.addEventListener("offline", updateOnline);

  // a background tab misses realtime events — pull everything on return
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    const { user, status } = useAuthStore.getState();
    if (status === "signed-in" && user && hiddenAt && Date.now() - hiddenAt > 30_000) {
      void resync();
    }
  });

  const savedSecret = await loadSessionSecret();
  if (savedSecret) appwriteClient.setSession(savedSecret);

  const user = await getCurrentUser();
  if (!user) {
    setAuth(null, "signed-out");
    return;
  }
  if (savedSecret) appwriteClient.setSession(savedSecret);
  setAuth(user, "signed-in");
  subscribeStores();
  startRealtime(user);
  await reconcile(user);
}

export async function signIn(email: string, password: string) {
  if (!account) throw new Error("Auth is not configured");
  const session = await account.createEmailPasswordSession(email, password);
  if (session.secret && appwriteClient) {
    appwriteClient.setSession(session.secret);
    await persistSession(session.secret);
  }
  const user = await getCurrentUser();
  useAuthStore.getState().setAuth(user, "signed-in");
  subscribeStores();
  if (user) {
    startRealtime(user);
    await reconcile(user);
  }
}

export async function signUp(name: string, email: string, password: string) {
  if (!account) throw new Error("Auth is not configured");
  await account.create(ID.unique(), email, password, name);
  await signIn(email, password);
}

/** signs out; local data deliberately stays on the device */
export async function signOut() {
  if (account) await account.deleteSession("current").catch(() => {});
  stopRealtime();
  await clearSession();
  useAuthStore.getState().setAuth(null, "signed-out");
}

/**
 * Mirrors the fetched substitute plan (plan ONLY — portal credentials never
 * leave this device) into a `portal` snapshot document, so the daily-digest
 * Appwrite function can respect cancellations and substitutions.
 */
export async function mirrorPortal(plan: PortalPlanJson) {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user || !appwriteClient) return;
  try {
    const docId = await snapshotDocId(user.id, SNAPSHOTS_COLLECTION_ID, "portal");
    const headers = { "content-type": "application/json", ...(await getAuthHeaders()) };
    const attributes = {
      userId: user.id,
      key: "portal",
      data: JSON.stringify({ days: plan.days, courses: plan.courses }),
      updatedAt: Date.now(),
    };
    let res = await fetch(
      `${REST_BASE}/databases/${DATABASE_ID}/collections/${SNAPSHOTS_COLLECTION_ID}/documents/${docId}`,
      { method: "PATCH", headers, body: JSON.stringify({ data: attributes }) },
    );
    if (res.status === 404) {
      res = await fetch(
        `${REST_BASE}/databases/${DATABASE_ID}/collections/${SNAPSHOTS_COLLECTION_ID}/documents`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            documentId: docId,
            permissions: [`read("user:${user.id}")`, `write("user:${user.id}")`],
            data: attributes,
          }),
        },
      );
    }
  } catch {
    // mirroring is best-effort — the digest just falls back to plain classes
  }
}

