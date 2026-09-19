"use client";

import { ID } from "appwrite";
import {
  CHATS_COLLECTION_ID,
  DATABASE_ID,
  DECKS_COLLECTION_ID,
  SNAPSHOTS_COLLECTION_ID,
  account,
  appwriteClient,
  appwriteConfigured,
  databases,
  getCurrentUser,
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
import type { Deck, StudyDoc } from "../types";
import type { PortalSub } from "../server/portal";

/** shape returned by /api/portal/fetch (see timetable page) */
export interface PortalPlanJson {
  days: Array<{ date: string; weekday: string; entries: PortalSub[] }>;
  courses: string[];
  stand: string | null;
}

/**
 * Sync model: **the cloud is the source of truth on page load.**
 *
 *  - On signed-in load, every store is replaced by its cloud snapshot
 *    ("load from the db first").
 *  - Afterwards each local change marks the store dirty and is pushed
 *    (debounced) — "write afterwards".
 *  - The only exception: local edits that never made it up (offline push
 *    failure) keep their dirty flag and win over the cloud on the next load,
 *    so offline work is never silently clobbered.
 *
 * Layout: subjects/todos/grades/events + the study-room selection live as one
 * snapshot document per store in `snapshots`; chats live in `chats` (one doc
 * per user) and decks in `decks` (one doc per deck). All are per-user
 * documents; permissions restrict them to their owner.
 */

const PUSH_DEBOUNCE_MS = 1200;
const MAX_CHAT_MESSAGES = 120;

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

interface KeyOps {
  /** document payload (everything except userId/key/updatedAt) */
  read: () => Record<string, unknown>;
  /** hydrate the store from a stored document */
  apply: (doc: Record<string, unknown>) => void;
  isEmpty: () => boolean;
  /** set when the collection has no `key` attribute (single-doc-per-user) */
  omitKey?: boolean;
}

const KEYS: Record<string, KeyOps> = {
  subjects: {
    read: () => ({ data: JSON.stringify({ subjects: useSubjectsStore.getState().subjects }) }),
    apply: (doc) =>
      useSubjectsStore.setState({ subjects: JSON.parse((doc.data as string) ?? "{}").subjects ?? [] }),
    isEmpty: () => useSubjectsStore.getState().subjects.length === 0,
  },
  todos: {
    read: () => ({ data: JSON.stringify({ todos: useTodosStore.getState().todos }) }),
    apply: (doc) =>
      useTodosStore.setState({ todos: JSON.parse((doc.data as string) ?? "{}").todos ?? [] }),
    isEmpty: () => useTodosStore.getState().todos.length === 0,
  },
  homework: {
    read: () => ({
      data: JSON.stringify({ homeworks: useHomeworkStore.getState().homeworks }),
    }),
    apply: (doc) =>
      useHomeworkStore.setState({
        homeworks: JSON.parse((doc.data as string) ?? "{}").homeworks ?? [],
      }),
    isEmpty: () => useHomeworkStore.getState().homeworks.length === 0,
  },
  timetable: {
    read: () => ({
      data: JSON.stringify({ entries: useTimetableStore.getState().entries }),
    }),
    apply: (doc) =>
      useTimetableStore.setState({
        entries: JSON.parse((doc.data as string) ?? "{}").entries ?? [],
      }),
    isEmpty: () => useTimetableStore.getState().entries.length === 0,
  },
  grades: {
    read: () => ({ data: JSON.stringify({ entries: useGradesStore.getState().entries }) }),
    apply: (doc) =>
      useGradesStore.setState({
        entries: normalizeGradeEntries(
          JSON.parse((doc.data as string) ?? "{}").entries ?? [],
        ),
      }),
    isEmpty: () => useGradesStore.getState().entries.length === 0,
  },
  events: {
    read: () => ({ data: JSON.stringify({ events: useEventsStore.getState().events }) }),
    apply: (doc) =>
      useEventsStore.setState({ events: JSON.parse((doc.data as string) ?? "{}").events ?? [] }),
    isEmpty: () => useEventsStore.getState().events.length === 0,
  },
  studyroom: {
    read: () => ({
      data: JSON.stringify({
        selectedDocIds: useStudyRoomStore.getState().selectedDocIds,
        deckIds: useStudyRoomStore.getState().decks.map((d) => d.id),
      }),
    }),
    apply: (doc) => {
      const parsed = JSON.parse((doc.data as string) ?? "{}");
      appliedDeckIds = parsed.deckIds ?? null;
      useStudyRoomStore.setState({
        selectedDocIds: parsed.selectedDocIds ?? [],
      });
    },
    isEmpty: () => false,
  },
  chats: {
    omitKey: true,
    collection: CHATS_COLLECTION_ID,
    read: () => ({
      messages: JSON.stringify(useStudyRoomStore.getState().chat.slice(-MAX_CHAT_MESSAGES)),
    }),
    apply: (doc) =>
      useStudyRoomStore.setState({ chat: JSON.parse((doc.messages as string) ?? "[]") }),
    isEmpty: () => useStudyRoomStore.getState().chat.length === 0,
  } as KeyOps & { collection?: string },
};

function collectionFor(key: string) {
  const col = (KEYS[key] as KeyOps & { collection?: string }).collection;
  return col ?? SNAPSHOTS_COLLECTION_ID;
}

let applyingRemote = false;
let subscribed = false;
let appliedDeckIds: string[] | null = null;
const pushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/* ---------------- realtime (cross-device pulls) ---------------- */

let realtimeUnsub: (() => void) | null = null;
/** our own document writes, by Appwrite document id → the updatedAt we wrote;
 *  realtime events with the same stamp are our own echoes, not remote changes */
const lastPushedAt = new Map<string, number>();

function startRealtime(user: AuthUser) {
  stopRealtime();
  if (!appwriteClient) return;
  const channels = [
    `databases.${DATABASE_ID}.collections.${SNAPSHOTS_COLLECTION_ID}.documents`,
    `databases.${DATABASE_ID}.collections.${CHATS_COLLECTION_ID}.documents`,
    `databases.${DATABASE_ID}.collections.${DECKS_COLLECTION_ID}.documents`,
  ];
  realtimeUnsub = appwriteClient.subscribe(channels, (response: {
    events: string[];
    payload: Record<string, unknown>;
  }) => {
    try {
      handleRealtimeEvent(response, user);
    } catch {
      // a malformed event must never break the tab
    }
  });
}

function stopRealtime() {
  realtimeUnsub?.();
  realtimeUnsub = null;
}

function handleRealtimeEvent(
  response: { events: string[]; payload: Record<string, unknown> },
  user: AuthUser,
) {
  const { user: currentUser, status } = useAuthStore.getState();
  if (status !== "signed-in" || currentUser?.id !== user.id) return;
  const doc = response.payload;
  if (doc.userId !== user.id) return; // another user's doc

  // deletions only matter for decks (snapshots are upserted, never deleted)
  if (response.events.some((e) => e.endsWith(".delete"))) {
    if (typeof doc.deckId === "string") {
      applyingRemote = true;
      useStudyRoomStore.getState().removeDeckSilently(doc.deckId);
      applyingRemote = false;
    }
    return;
  }

  // ignore echoes of our own writes
  const docId = doc.$id as string | undefined;
  const updatedAt = typeof doc.updatedAt === "number" ? doc.updatedAt : 0;
  if (docId !== undefined && lastPushedAt.get(docId) === updatedAt) return;

  applyingRemote = true;
  try {
    const key = doc.key as string | undefined;
    if (key !== undefined && KEYS[key] !== undefined) {
      KEYS[key].apply(doc);
    } else if (typeof doc.deckId === "string") {
      const deckId = doc.deckId;
      const remoteDeck = {
        id: deckId,
        title: (doc.title as string) ?? "Deck",
        documentIds: JSON.parse((doc.documentIds as string) ?? "[]"),
        createdAt: (doc.createdAt as number) ?? 0,
        updatedAt: (doc.updatedAt as number) ?? 0,
        cards: JSON.parse((doc.cards as string) ?? "[]"),
      } satisfies Deck;
      useStudyRoomStore.setState((s) => ({
        decks: [...s.decks.filter((x) => x.id !== deckId), remoteDeck],
      }));
    } else if (typeof doc.messages === "string") {
      KEYS.chats.apply(doc);
    }
  } finally {
    applyingRemote = false;
  }
}

async function upsertDocument(collection: string, docId: string, payload: Record<string, unknown>, userId: string) {
  const permissions = [`read("user:${userId}")`, `write("user:${userId}")`];
  try {
    await databases!.updateDocument(DATABASE_ID, collection, docId, payload);
  } catch {
    await databases!.createDocument(DATABASE_ID, collection, docId, payload, permissions);
  }
}

/**
 * Store keys where an empty local list must never overwrite non-empty cloud
 * data — protects against wiping the cloud from a device that never loaded it
 * (fresh install, offline reconcile, cleared storage). studyroom/chats are
 * exempt: clearing the chat or the selection is a legitimate empty sync.
 */
const GUARDED_KEYS = new Set(["subjects", "todos", "homework", "grades", "events", "timetable"]);

/** true when the local payload holds only empty lists while the cloud
 *  document still has items — pushing it would destroy cloud data */
async function wouldWipeRemote(userId: string, key: string, attributes: Record<string, unknown>) {
  try {
    const local = JSON.parse((attributes.data as string) ?? "{}");
    if (typeof local !== "object" || !Object.values(local).every((v) => Array.isArray(v) && v.length === 0))
      return false;
    const docId = await snapshotDocId(userId, collectionFor(key), key);
    const remote = (await databases!.getDocument(
      DATABASE_ID,
      collectionFor(key),
      docId,
    )) as unknown as Record<string, unknown>;
    const remoteData = JSON.parse((remote.data as string) ?? "{}");
    return Object.values(remoteData).some((v) => Array.isArray(v) && v.length > 0);
  } catch {
    return false; // remote unreadable (or absent) → don't block the push
  }
}

async function pushSnapshot(userId: string, key: string) {
  const ops = KEYS[key];
  const { setSyncing, setSynced, setSyncError } = useAuthStore.getState();
  setSyncing(true);
  try {
    const docId = await snapshotDocId(userId, collectionFor(key), key);
    // new Appwrite API: `data` is the attributes object (was: a JSON string
    // per attribute — the old flat shape now fails with "Unknown attribute")
    const updatedAt = Date.now();
    const attributes: Record<string, unknown> = { userId, ...ops.read(), updatedAt };
    if (!ops.omitKey) attributes.key = key;
    const payload = { data: attributes };

    // baseline rule: a device that has never observed this store's cloud state
    // (fresh install, reconcile failed offline) must not push — it could wipe
    // data it has never seen. Dirty stays; the next reconcile sets the baseline
    // and this change is re-evaluated against the loaded cloud state.
    if (GUARDED_KEYS.has(key) && !useSyncMetaStore.getState().isLoaded(key)) {
      setSyncing(false);
      return;
    }

    if (GUARDED_KEYS.has(key) && (await wouldWipeRemote(userId, key, attributes))) {
      // keep the cloud copy; clear the dirty flag so we don't retry forever —
      // the next reconcile will pull the cloud state back onto this device
      useSyncMetaStore.getState().clearDirty(key);
      setSyncing(false);
      return;
    }

    await upsertDocument(collectionFor(key), docId, payload, userId);
    lastPushedAt.set(docId, updatedAt); // own echo — ignore in realtime
    useSyncMetaStore.getState().clearDirty(key);
    setSynced(Date.now());
  } catch (e) {
    // offline: the change stays dirty in localStorage and uploads on the next sync
    if (!navigator.onLine) {
      useAuthStore.getState().setSyncing(false);
      return;
    }
    setSyncError((e as Error).message);
  }
}

function schedulePush(key: string) {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user || applyingRemote) return;
  useSyncMetaStore.getState().markDirty(key, Date.now());
  clearTimeout(pushTimers[key]);
  pushTimers[key] = setTimeout(() => void pushSnapshot(user.id, key), PUSH_DEBOUNCE_MS);
}

/* ---------------- decks (one document per deck, fetched by id) ---------------- */

function docToDeck(doc: Record<string, unknown>): Deck {
  return {
    id: doc.deckId as string,
    title: (doc.title as string) ?? "Deck",
    documentIds: JSON.parse((doc.documentIds as string) ?? "[]"),
    createdAt: (doc.createdAt as number) ?? 0,
    updatedAt: (doc.updatedAt as number) ?? 0,
    cards: JSON.parse((doc.cards as string) ?? "[]"),
  };
}

async function getDeckDoc(user: AuthUser, deckId: string): Promise<Deck | null> {
  try {
    const docId = await snapshotDocId(user.id, DECKS_COLLECTION_ID, deckId);
    const doc = (await databases!.getDocument(
      DATABASE_ID,
      DECKS_COLLECTION_ID,
      docId,
    )) as unknown as Record<string, unknown>;
    return docToDeck(doc);
  } catch {
    return null;
  }
}

async function pushDeck(user: AuthUser, deck: Deck) {
  const docId = await snapshotDocId(user.id, DECKS_COLLECTION_ID, deck.id);
  const updatedAt = Date.now();
  await upsertDocument(
    DECKS_COLLECTION_ID,
    docId,
    {
      data: {
        userId: user.id,
        deckId: deck.id,
        title: deck.title,
        documentIds: JSON.stringify(deck.documentIds),
        cards: JSON.stringify(deck.cards),
        createdAt: deck.createdAt,
        updatedAt,
      },
    },
    user.id,
  );
  lastPushedAt.set(docId, updatedAt); // own echo — ignore in realtime
}

async function syncDecks(user: AuthUser) {
  const { setSyncing, setSynced, setSyncError } = useAuthStore.getState();
  setSyncing(true);
  try {
    const room = useStudyRoomStore.getState();
    const local = room.decks;

    // 1. deletions recorded while offline/pending → apply them in the cloud
    const deletedIds = [...room.deletedDeckIds];
    for (const id of deletedIds) {
      const docId = await snapshotDocId(user.id, DECKS_COLLECTION_ID, id);
      try {
        await databases!.deleteDocument(DATABASE_ID, DECKS_COLLECTION_ID, docId);
      } catch {
        /* already gone */
      }
    }
    if (deletedIds.length > 0) {
      useStudyRoomStore.setState((s) => ({
        deletedDeckIds: s.deletedDeckIds.filter((id) => !deletedIds.includes(id)),
      }));
    }

    // 2. push every local deck (few, small — upsert)
    for (const deck of local) await pushDeck(user, deck);

    // 3. restore decks that the snapshot lists but this device doesn't have
    //    (fresh device / cleared storage). Decks deleted on another device are
    //    already gone from the cloud, so nothing is resurrected.
    for (const id of appliedDeckIds ?? []) {
      if (local.some((d) => d.id === id) || deletedIds.includes(id)) continue;
      const remoteDeck = await getDeckDoc(user, id);
      if (remoteDeck) {
        useStudyRoomStore.setState((s) => ({
          decks: [...s.decks.filter((x) => x.id !== id), remoteDeck],
        }));
      }
    }
    setSynced(Date.now());
  } catch (e) {
    if (!navigator.onLine) {
      setSyncing(false);
      return; // queued — pushes retry when the connection is back
    }
    setSyncError((e as Error).message);
  }
}

function scheduleDecks() {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user || applyingRemote) return;
  clearTimeout(pushTimers["decks"]);
  pushTimers["decks"] = setTimeout(() => void syncDecks(user), PUSH_DEBOUNCE_MS);
}

/* ---------------- init / auth actions ---------------- */

function subscribeStores() {
  if (subscribed) return;
  subscribed = true;
  for (const key of [
    "subjects",
    "todos",
    "homework",
    "grades",
    "events",
    "timetable",
    "studyroom",
    "chats",
  ]) {
    const store =
      key === "subjects"
        ? useSubjectsStore
        : key === "todos"
          ? useTodosStore
          : key === "homework"
            ? useHomeworkStore
            : key === "grades"
              ? useGradesStore
              : key === "events"
                ? useEventsStore
                : key === "timetable"
                  ? useTimetableStore
                  : useStudyRoomStore;
    store.subscribe(() => schedulePush(key));
  }
  // decks live in the study-room store too, but sync as their own documents
  useStudyRoomStore.subscribe(() => scheduleDecks());
}

async function reconcile(user: AuthUser) {
  applyingRemote = true;
  const { setSynced, setSyncError } = useAuthStore.getState();
  try {
    for (const [key, ops] of Object.entries(KEYS)) {
      // load from the db first…
      let remote: Record<string, unknown> | null = null;
      let observedCloud = false; // 404 (empty cloud) counts as observed
      try {
        const docId = await snapshotDocId(user.id, collectionFor(key), key);
        remote = (await databases!.getDocument(
          DATABASE_ID,
          collectionFor(key),
          docId,
        )) as unknown as Record<string, unknown>;
        observedCloud = true;
      } catch (e) {
        remote = null;
        observedCloud = (e as { code?: number }).code === 404;
      }
      if (observedCloud) useSyncMetaStore.getState().markLoaded(key);

      // …unless this device holds local edits that never made it up
      const dirtyAt = useSyncMetaStore.getState().dirtyAt[key];
      const hasUnsyncedEdits = dirtyAt !== undefined && (!remote || dirtyAt > (remote.updatedAt as number));

      if (remote && !hasUnsyncedEdits) {
        ops.apply(remote);
        useSyncMetaStore.getState().clearDirty(key);
        continue;
      }
      if (!remote && ops.isEmpty()) continue;
      // write afterwards: unsynced edits, or fresh local data with no snapshot yet
      await pushSnapshot(user.id, key);
    }

    // decks reconcile: fresh device loads everything, otherwise merge per deck
    await syncDecks(user);

    setSynced(Date.now());
  } catch (e) {
    setSyncError((e as Error).message);
  } finally {
    applyingRemote = false;
  }
}

/** restores the Appwrite session (if any) and reconciles — run once on mount */
export async function initSync() {
  const { setAuth, setOnline } = useAuthStore.getState();
  if (!appwriteConfigured || !account || !databases) {
    setAuth(null, "unconfigured");
    return;
  }
  setAuth(null, "loading");

  // offline flag + auto-resync when the connection comes back
  const updateOnline = () => setOnline(navigator.onLine);
  updateOnline();
  window.addEventListener("online", () => {
    updateOnline();
    void syncNow();
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
      void reconcile(user);
    }
  });

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
  // belt & suspenders: keeps the session alive even where cookies are
  // unreliable (embedded browsers); real Appwrite sessions carry a secret
  if (session.secret && appwriteClient) appwriteClient.setSession(session.secret);
  const user = await getCurrentUser();
  useAuthStore.getState().setAuth(user, "signed-in");
  subscribeStores();
  if (user) startRealtime(user);
  if (user) await reconcile(user);
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
  lastPushedAt.clear();
  useAuthStore.getState().setAuth(null, "signed-out");
}

/**
 * Mirrors the fetched substitute plan (plan ONLY — portal credentials never
 * leave this device) into a `portal` snapshot document, so the daily-digest
 * Appwrite function can respect cancellations and substitutions.
 */
export async function mirrorPortal(plan: PortalPlanJson) {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user || !databases) return;
  try {
    const docId = await snapshotDocId(user.id, SNAPSHOTS_COLLECTION_ID, "portal");
    await upsertDocument(
      SNAPSHOTS_COLLECTION_ID,
      docId,
      {
        userId: user.id,
        key: "portal",
        data: JSON.stringify({ days: plan.days, courses: plan.courses }),
        updatedAt: Date.now(),
      },
      user.id,
    );
  } catch {
    // mirroring is best-effort — the digest just falls back to plain classes
  }
}

/** manual "Sync now" — full round-trip: pull the cloud state (reconcile) and
 *  push whatever is still unsynced locally */
export async function syncNow() {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user) return;
  await reconcile(user);
}
