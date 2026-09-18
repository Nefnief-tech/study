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
import { useStudyRoomStore } from "@/lib/store/studyroom";
import type { Deck, StudyDoc } from "../types";

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

async function upsertDocument(collection: string, docId: string, payload: Record<string, unknown>, userId: string) {
  const permissions = [`read("user:${userId}")`, `write("user:${userId}")`];
  try {
    await databases!.updateDocument(DATABASE_ID, collection, docId, payload);
  } catch {
    await databases!.createDocument(DATABASE_ID, collection, docId, payload, permissions);
  }
}

async function pushSnapshot(userId: string, key: string) {
  const ops = KEYS[key];
  const { setSyncing, setSynced, setSyncError } = useAuthStore.getState();
  setSyncing(true);
  try {
    const docId = await snapshotDocId(userId, collectionFor(key), key);
    const payload: Record<string, unknown> = { userId, ...ops.read(), updatedAt: Date.now() };
    if (!ops.omitKey) payload.key = key;
    await upsertDocument(collectionFor(key), docId, payload, userId);
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
  await upsertDocument(
    DECKS_COLLECTION_ID,
    docId,
    {
      userId: user.id,
      deckId: deck.id,
      title: deck.title,
      documentIds: JSON.stringify(deck.documentIds),
      cards: JSON.stringify(deck.cards),
      createdAt: deck.createdAt,
      updatedAt: Date.now(),
    },
    user.id,
  );
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
  for (const key of ["subjects", "todos", "homework", "grades", "events", "studyroom", "chats"]) {
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
      try {
        const docId = await snapshotDocId(user.id, collectionFor(key), key);
        remote = (await databases!.getDocument(
          DATABASE_ID,
          collectionFor(key),
          docId,
        )) as unknown as Record<string, unknown>;
      } catch {
        remote = null;
      }

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

  const user = await getCurrentUser();
  if (!user) {
    setAuth(null, "signed-out");
    return;
  }
  setAuth(user, "signed-in");
  subscribeStores();
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
  useAuthStore.getState().setAuth(null, "signed-out");
}

/** manual push of everything (used by the "Sync now" button) */
export async function syncNow() {
  const { user, status } = useAuthStore.getState();
  if (status !== "signed-in" || !user) return;
  for (const key of Object.keys(KEYS)) await pushSnapshot(user.id, key);
  await syncDecks(user);
}
