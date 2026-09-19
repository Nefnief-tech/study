import { ID } from "appwrite";
import {
  DATABASE_ID,
  account,
  appwriteClient,
  appwriteConfigured,
  getCurrentUser,
  getAppwriteJwtHeaders,
  type AuthUser,
} from "./appwrite";
import { useAuthStore, useSyncMetaStore } from "@/lib/store/auth";
import { useSubjectsStore } from "@/lib/store/subjects";
import { useTodosStore } from "@/lib/store/todos";
import { useGradesStore } from "@/lib/store/grades";
import { useEventsStore } from "@/lib/store/events";
import { useHomeworkStore } from "@/lib/store/homework";
import { useTimetableStore, timetableRowId } from "@/lib/store/timetable";
import { useStudyRoomStore } from "@/lib/store/studyroom";
import { usePortalStore, portalSubRowId, portalCourseRowId } from "@/lib/store/portal";
import { hashId } from "@/lib/utils";
import type {
  Deck,
  GradeEntry,
  Homework,
  StudyEvent,
  Subject,
  TimetableEntry,
  Todo,
} from "@/lib/types";
import type { PortalSub } from "../server/portal";

/**
 * Sync model — one structured layer:
 *
 * EVERYTHING syncs as rows in Appwrite tables (subjects · todos · homeworks ·
 * grades · events · timetable_entries · chat_messages · decks · flashcards ·
 * study_selection · portal_entries · portal_courses). One row per entity,
 * rowId = the entity id (or a content hash for id-less entities):
 *
 *   push  = diff the local store against the last-synced row digests and
 *           upsert changed rows / soft-delete (deleted=true) removed rows
 *   pull  = fetch all rows of the user and merge — rows with pending local
 *           edits win, remote rows otherwise, deleted rows remove locally
 *   realtime = single-row events through the same merge
 *
 * A device can therefore never wipe data it hasn't seen: with no local
 * entities and no stored digests the push phase has nothing to do, so a
 * fresh device's first sync is a pure pull.
 */

const PUSH_DEBOUNCE_MS = 1200;
const MAX_CHAT_MESSAGES = 120;

/** REST base for row calls (the Dart/JS SDK models are bypassed — see git) */
const REST_BASE = "https://fra.cloud.appwrite.io/v1";

/* ================================================================== */
/* ROW STORES                                                          */
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
  timetable: {
    table: "timetable_entries",
    // entries have no natural id — the row id is the content hash
    list: () =>
      useTimetableStore.getState().entries.map((e) => ({
        ...e,
        id: timetableRowId(e),
      })),
    upsertOne: (e) => useTimetableStore.getState().upsertEntry(e as Todo extends never ? never : TimetableEntry),
    removeOne: (id) => useTimetableStore.getState().removeEntry(id),
    toRow: (e) => {
      const entry = e as TimetableEntry;
      return {
        day: entry.day,
        period: entry.period,
        time: entry.time ?? "",
        subject: entry.subject,
        teacher: entry.teacher ?? "",
        room: entry.room ?? "",
        deleted: false,
      };
    },
    fromRow: (row) =>
      ({
        day: str(row.day) || "Mon",
        period: num(row.period) || 1,
        time: str(row.time) || undefined,
        subject: str(row.subject),
        teacher: str(row.teacher) || undefined,
        room: str(row.room) || undefined,
      }) as unknown as TimetableEntry,
  },
  chat: {
    table: "chat_messages",
    list: () =>
      useStudyRoomStore.getState().chat
        .filter((m) => m.id)
        .slice(-MAX_CHAT_MESSAGES)
        .map((m) => ({ ...m, id: m.id as string })),
    upsertOne: (m) => useStudyRoomStore.getState().upsertChatMessage(m),
    removeOne: (id) => useStudyRoomStore.getState().removeChatMessage(id),
    toRow: (m) => {
      const message = m as { role: string; content: string; sources?: string[]; sentAt?: number };
      return {
        role: message.role,
        content: message.content,
        sources: JSON.stringify(message.sources ?? []),
        sentAt: message.sentAt ?? Date.now(),
        deleted: false,
      };
    },
    fromRow: (row) => {
      let sources: string[] | undefined;
      try {
        const parsed = JSON.parse(str(row.sources) || "[]");
        sources = Array.isArray(parsed) ? parsed.map(String) : undefined;
      } catch {}
      return {
        id: String(row.$id),
        role: str(row.role) === "user" ? ("user" as const) : ("assistant" as const),
        content: str(row.content),
        sources,
        sentAt: num(row.sentAt),
      };
    },
  },
  decks: {
    table: "decks",
    list: () => useStudyRoomStore.getState().decks,
    upsertOne: (deck) => {
      // rows carry no cards — keep the locally known ones when merging
      const existing = useStudyRoomStore
        .getState()
        .decks.find((d) => d.id === (deck as Deck).id);
      useStudyRoomStore.getState().upsertDeck({ ...(deck as Deck), cards: existing?.cards ?? [] });
    },
    removeOne: (id) => useStudyRoomStore.getState().removeDeck(id),
    toRow: (deck) => {
      const d = deck as Deck;
      return {
        title: d.title,
        documentIds: JSON.stringify(d.documentIds ?? []),
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        deleted: false,
      };
    },
    fromRow: (row) =>
      ({
        id: String(row.$id),
        title: str(row.title) || "Deck",
        documentIds: (() => {
          try {
            const parsed = JSON.parse(str(row.documentIds) || "[]");
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return [];
          }
        })(),
        createdAt: num(row.createdAt),
        updatedAt: num(row.updatedAt),
        cards: [],
      }) as unknown as Deck,
  },
  flashcards: {
    table: "flashcards",
    list: () =>
      useStudyRoomStore
        .getState()
        .decks.flatMap((d) => d.cards.map((c) => ({ ...c, deckId: d.id }))),
    upsertOne: (card) => {
      const c = card as { id: string; deckId: string; front: string; back: string };
      const room = useStudyRoomStore.getState();
      // a card can arrive before its deck row — keep it attachable
      if (!room.decks.some((d) => d.id === c.deckId)) {
        room.upsertDeck({
          id: c.deckId,
          title: "Deck",
          documentIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cards: [],
        });
      }
      room.upsertCard(c.deckId, { id: c.id, front: c.front, back: c.back });
    },
    removeOne: (id) => {
      const deck = useStudyRoomStore.getState().decks.find((d) => d.cards.some((c) => c.id === id));
      if (deck) useStudyRoomStore.getState().removeCard(deck.id, id);
    },
    toRow: (card) => {
      const c = card as { deckId: string; front: string; back: string };
      return { deckId: c.deckId, front: c.front, back: c.back, deleted: false };
    },
    fromRow: (row) =>
      ({
        id: String(row.$id),
        deckId: str(row.deckId),
        front: str(row.front),
        back: str(row.back),
      }) as unknown as { id: string; deckId: string; front: string; back: string },
  },
  selection: {
    table: "study_selection",
    list: () =>
      useStudyRoomStore.getState().selectedDocIds.map((docId) => ({
        id: hashId(`sel|${docId}`),
        documentId: docId,
      })),
    upsertOne: (sel) => useStudyRoomStore.getState().upsertSelection((sel as { documentId: string }).documentId),
    removeOne: (id) => {
      const docId = useStudyRoomStore
        .getState()
        .selectedDocIds.find((d) => hashId(`sel|${d}`) === id);
      if (docId) useStudyRoomStore.getState().removeSelection(docId);
    },
    toRow: (sel) => ({ documentId: (sel as { documentId: string }).documentId, deleted: false }),
    fromRow: (row) => ({ id: String(row.$id), documentId: str(row.documentId) }),
  },
  portalEntries: {
    table: "portal_entries",
    list: () =>
      (usePortalStore.getState().data?.days ?? []).flatMap((day) =>
        day.entries.map((sub) => ({ ...sub, id: portalSubRowId(sub) })),
      ),
    upsertOne: (sub) => usePortalStore.getState().upsertSub(sub as PortalSub),
    removeOne: (id) => usePortalStore.getState().removeSub(id),
    toRow: (sub) => {
      const e = sub as PortalSub;
      return {
        date: e.date,
        weekday: e.weekday,
        period: e.period,
        course: e.course,
        courseOld: e.courseOld ?? "",
        substitute: e.substitute,
        room: e.room,
        info: e.info,
        cancelled: e.cancelled,
        deleted: false,
      };
    },
    fromRow: (row) =>
      ({
        date: str(row.date),
        weekday: str(row.weekday),
        period: str(row.period),
        course: str(row.course),
        courseOld: str(row.courseOld) || undefined,
        substitute: str(row.substitute),
        room: str(row.room),
        info: str(row.info),
        cancelled: bool(row.cancelled),
      }) as unknown as PortalSub,
  },
  portalCourses: {
    table: "portal_courses",
    list: () =>
      (usePortalStore.getState().data?.courses ?? []).map((course) => ({
        id: portalCourseRowId(course),
        course,
      })),
    upsertOne: (row) => usePortalStore.getState().upsertCourse((row as { course: string }).course),
    removeOne: (id) => {
      const course = usePortalStore
        .getState()
        .data?.courses.find((c) => portalCourseRowId(c) === id);
      if (course) usePortalStore.getState().removeCourse(id);
    },
    toRow: (row) => ({ course: (row as { course: string }).course, deleted: false }),
    fromRow: (row) => ({ id: String(row.$id), course: str(row.course) }),
  },
};

const ROW_STORE_KEYS = Object.keys(ROW_STORES);

const ROW_TABLES: Record<string, string> = Object.fromEntries(
  ROW_STORE_KEYS.map((key) => [key, ROW_STORES[key].table]),
);

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
  `${REST_BASE}/tablesdb/${DATABASE_ID}/tables/${table}/rows${rowId ? `/${rowId}` : ""}`;

/** row request headers; a stale cached JWT is the classic 401 — refresh once */
async function rowHeaders(): Promise<Record<string, string>> {
  return getAppwriteJwtHeaders();
}

async function rowFetch(path: string, init: RequestInit): Promise<Response> {
  let res = await fetch(path, { ...init, headers: await rowHeaders() });
  if (res.status === 401) {
    res = await fetch(path, { ...init, headers: await getAppwriteJwtHeaders(true) });
  }
  return res;
}

async function restListRows(table: string, userId: string): Promise<Array<RowData & { $id: string }>> {
  // the API wants one JSON-encoded query per `queries[]` param — a single
  // JSON-array string under `queries=` is rejected as invalid (400)
  const query = [
    { method: "equal", attribute: "userId", values: [userId] },
    { method: "limit", values: [100] },
  ]
    .map((q) => `queries[]=${encodeURIComponent(JSON.stringify(q))}`)
    .join("&");
  const res = await rowFetch(`${rowsUri(table)}?${query}`, {});
  if (!res.ok) throw new Error(`list ${table} → ${res.status}`);
  const json = (await res.json()) as { rows?: Array<RowData & { $id: string }> };
  return json.rows ?? [];
}

async function restUpsertRow(table: string, rowId: string, data: RowData, userId: string) {
  const body = JSON.stringify({ data });
  let res = await rowFetch(rowsUri(table, rowId), {
    method: "PATCH",
    body,
  });
  if (res.status === 404) {
    res = await rowFetch(rowsUri(table), {
      method: "POST",
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
  const res = await rowFetch(rowsUri(table, rowId), {
    method: "PATCH",
    body: JSON.stringify({ data: { deleted: true } }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete ${table}/${rowId} → ${res.status}`);
  }
}

/* ---------------- row push (diff) + pull (merge) ---------------- */

const rowPushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

let applyingRemote = false;

function scheduleRowSync(storeKey: string) {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user || applyingRemote) return;
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
      await restUpsertRow(def.table, entity.id, { ...def.toRow(entity), userId: user.id }, user.id);
      // record the pushed digest — otherwise the entity re-pushes on every
      // sync, each push echoing a realtime event → endless churn
      digests[entity.id] = digest;
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
    applyingRemote = true;
    try {
      def.upsertOne(entity);
    } finally {
      applyingRemote = false;
    }
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
/* RECONCILE                                                           */
/* ================================================================== */

let reconciling = false;

async function runReconcile(user: AuthUser) {
  if (reconciling) return;
  reconciling = true;
  const auth = useAuthStore.getState();
  try {
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

    auth.setSynced(Date.now());
  } catch (e) {
    auth.setSyncError((e as Error).message);
  } finally {
    reconciling = false;
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

async function reconcile(user: AuthUser) {
  const { status, user: current } = useAuthStore.getState();
  if (status !== "signed-in" || current?.id !== user.id) return;
  await runReconcile(user);
}

/* ================================================================== */
/* REALTIME                                                            */
/* ================================================================== */

let realtimeUnsub: Array<() => void> = [];

function startRealtime(user: AuthUser) {
  stopRealtime();
  if (!appwriteClient) return;
  const channels = ROW_STORE_KEYS.map(
    (key) => `databases.${DATABASE_ID}.tables.${ROW_TABLES[key]}.rows`,
  );
  realtimeUnsub = [
    appwriteClient.subscribe(channels, (response) => {
      try {
        handleRealtimeEvent(
          response as { events: string[]; payload: Record<string, unknown> },
          user,
        );
      } catch {
        // a malformed event must never break the tab
      }
    }),
  ];
}

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

  // another user's row — never merge it
  if (payload.userId !== user.id) return;

  if (event.includes("/tables/")) {
    for (const [storeKey, table] of Object.entries(ROW_TABLES)) {
      if (event.includes(`/tables/${table}/rows`)) {
        void mergeRowEvent(storeKey, { ...payload, $id: String(payload.$id ?? "") });
        return;
      }
    }
  }
}

/* ================================================================== */
/* SUBSCRIPTIONS + INIT/AUTH                                           */
/* ================================================================== */

let subscribed = false;

function subscribeStores() {
  if (subscribed) return;
  subscribed = true;

  for (const key of ROW_STORE_KEYS) {
    switch (key) {
      case "subjects":
        useSubjectsStore.subscribe(() => scheduleRowSync("subjects"));
        break;
      case "todos":
        useTodosStore.subscribe(() => scheduleRowSync("todos"));
        break;
      case "homework":
        useHomeworkStore.subscribe(() => scheduleRowSync("homework"));
        break;
      case "grades":
        useGradesStore.subscribe(() => scheduleRowSync("grades"));
        break;
      case "events":
        useEventsStore.subscribe(() => scheduleRowSync("events"));
        break;
      case "timetable":
        useTimetableStore.subscribe(() => scheduleRowSync("timetable"));
        break;
      case "chat":
      case "decks":
      case "flashcards":
      case "selection":
        useStudyRoomStore.subscribe(() => scheduleRowSync(key));
        break;
      case "portalEntries":
      case "portalCourses":
        usePortalStore.subscribe(() => scheduleRowSync(key));
        break;
    }
  }
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
  // The web SDK auto-attaches its own localStorage fallback session on every
  // call. A stale one from a previously signed-in account mixes identities —
  // JWTs get minted for the old session while row queries use the current
  // user → cross-user 401s. Our own secret (setSession) is authoritative.
  try {
    localStorage.removeItem("cookieFallback");
  } catch {}
  if (savedSecret) appwriteClient.setSession(savedSecret);

  const user = await getCurrentUser();
  if (!user) {
    setAuth(null, "signed-out");
    return;
  }
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
  try {
    localStorage.removeItem("cookieFallback");
  } catch {}
  useAuthStore.getState().setAuth(null, "signed-out");
}
