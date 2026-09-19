import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage, Deck, StudyDoc } from "../types";
import { uid } from "../utils";

interface StudyRoomState {
  /** server-side document metadata — refetched on mount, not persisted */
  documents: StudyDoc[];
  configured: boolean;
  setDocuments: (documents: StudyDoc[], configured: boolean) => void;
  addDocument: (doc: StudyDoc) => void;
  removeDocument: (id: string) => void;

  /** which documents feed flashcards & chat */
  selectedDocIds: string[];
  toggleSelectedDoc: (id: string) => void;
  setSelectedDocs: (ids: string[]) => void;
  /** structured sync: replace selection with the cloud state */
  replaceSelectedDocIds: (ids: string[]) => void;

  decks: Deck[];
  /** decks deleted while a cloud sync was unavailable/pending */
  deletedDeckIds: string[];
  addDeck: (deck: Omit<Deck, "id" | "createdAt" | "updatedAt">) => Deck;
  removeDeck: (id: string) => void;
  /** deck deleted on ANOTHER device (realtime) — no deletion marker */
  removeDeckSilently: (id: string) => void;
  /** structured sync: deck upserted from the cloud */
  upsertDeck: (deck: Deck) => void;

  chat: ChatMessage[];
  appendMessage: (message: ChatMessage) => void;
  updateLastAssistant: (content: string, sources?: string[]) => void;
  clearChat: () => void;
  /** structured sync: replace chat with the cloud state */
  replaceChat: (
    messages: Array<{ role: string; content: string; sources?: string[] }>,
  ) => void;
  /** row-level sync ops */
  upsertChatMessage: (message: ChatMessage) => void;
  removeChatMessage: (id: string) => void;
  upsertCard: (deckId: string, card: Deck["cards"][number]) => void;
  removeCard: (deckId: string, cardId: string) => void;
  upsertSelection: (docId: string) => void;
  removeSelection: (docId: string) => void;
}

export const useStudyRoomStore = create<StudyRoomState>()(
  persist(
    (set) => ({
      documents: [],
      configured: false,
      setDocuments: (documents, configured) => set({ documents, configured }),
      addDocument: (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
      removeDocument: (id) =>
        set((s) => ({
          documents: s.documents.filter((d) => d.id !== id),
          selectedDocIds: s.selectedDocIds.filter((x) => x !== id),
        })),

      selectedDocIds: [],
      toggleSelectedDoc: (id) =>
        set((s) => ({
          selectedDocIds: s.selectedDocIds.includes(id)
            ? s.selectedDocIds.filter((x) => x !== id)
            : [...s.selectedDocIds, id],
        })),
      setSelectedDocs: (ids) => set({ selectedDocIds: ids }),
      replaceSelectedDocIds: (ids) => set({ selectedDocIds: ids }),

      decks: [],
      deletedDeckIds: [],
      addDeck: (deck) => {
        const full: Deck = { ...deck, id: uid(), createdAt: Date.now(), updatedAt: Date.now() };
        set((s) => ({ decks: [full, ...s.decks] }));
        return full;
      },
      removeDeck: (id) =>
        set((s) => ({
          decks: s.decks.filter((d) => d.id !== id),
          deletedDeckIds: [...s.deletedDeckIds, id],
        })),
      removeDeckSilently: (id) =>
        set((s) => ({ decks: s.decks.filter((d) => d.id !== id) })),
      upsertDeck: (deck) =>
        set((s) => ({
          decks: [...s.decks.filter((d) => d.id !== deck.id), deck],
        })),

      chat: [],
      appendMessage: (message) =>
        set((s) => ({
          chat: [
            ...s.chat,
            { sentAt: Date.now(), ...message, id: message.id ?? uid() },
          ],
        })),
      updateLastAssistant: (content, sources) =>
        set((s) => {
          if (s.chat.length === 0 || s.chat[s.chat.length - 1].role !== "assistant") return s;
          const chat = s.chat.slice(0, -1);
          const last = s.chat[s.chat.length - 1];
          chat.push({ role: "assistant", content, sources, id: last.id, sentAt: last.sentAt });
          return { chat };
        }),
      clearChat: () => set({ chat: [] }),
      replaceChat: (messages) =>
        set(() => ({
          chat: messages.map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            content: m.content,
            sources: m.sources,
          })),
        })),
      upsertChatMessage: (message) =>
        set((s) => ({
          chat: [...s.chat.filter((m) => m.id !== message.id), message],
        })),
      removeChatMessage: (id) =>
        set((s) => ({ chat: s.chat.filter((m) => m.id !== id) })),
      upsertCard: (deckId, card) =>
        set((s) => ({
          decks: s.decks.map((d) =>
            d.id === deckId
              ? { ...d, cards: [...d.cards.filter((c) => c.id !== card.id), card] }
              : d,
          ),
        })),
      removeCard: (deckId, cardId) =>
        set((s) => ({
          decks: s.decks.map((d) =>
            d.id === deckId ? { ...d, cards: d.cards.filter((c) => c.id !== cardId) } : d,
          ),
        })),
      upsertSelection: (docId) =>
        set((s) => ({
          selectedDocIds: s.selectedDocIds.includes(docId)
            ? s.selectedDocIds
            : [...s.selectedDocIds, docId],
        })),
      removeSelection: (docId) =>
        set((s) => ({ selectedDocIds: s.selectedDocIds.filter((x) => x !== docId) })),
    }),
    {
      name: "semester.studyroom",
      version: 3,
      migrate: (state) => {
        const v = state as Partial<StudyRoomState> & { chat?: Array<{ id?: string; sentAt?: number }> };
        // chat messages synced as rows need an id + timestamp
        const chat = (v.chat ?? []).map((m, i) => ({
          ...m,
          id: m.id ?? uid(),
          sentAt: m.sentAt ?? Date.now() - (v.chat!.length - i) * 1000,
        }));
        return {
          ...(v as Partial<StudyRoomState>),
          deletedDeckIds: v.deletedDeckIds ?? [],
          chat,
        } as StudyRoomState;
      },
      partialize: (s) => ({
        selectedDocIds: s.selectedDocIds,
        decks: s.decks,
        deletedDeckIds: s.deletedDeckIds,
        chat: s.chat,
      }),
    },
  ),
);
