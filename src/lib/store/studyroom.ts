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

  decks: Deck[];
  /** decks deleted while a cloud sync was unavailable/pending */
  deletedDeckIds: string[];
  addDeck: (deck: Omit<Deck, "id" | "createdAt" | "updatedAt">) => Deck;
  removeDeck: (id: string) => void;

  chat: ChatMessage[];
  appendMessage: (message: ChatMessage) => void;
  updateLastAssistant: (content: string, sources?: string[]) => void;
  clearChat: () => void;
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

      chat: [],
      appendMessage: (message) => set((s) => ({ chat: [...s.chat, message] })),
      updateLastAssistant: (content, sources) =>
        set((s) => {
          if (s.chat.length === 0 || s.chat[s.chat.length - 1].role !== "assistant") return s;
          const chat = s.chat.slice(0, -1);
          chat.push({ role: "assistant", content, sources });
          return { chat };
        }),
      clearChat: () => set({ chat: [] }),
    }),
    {
      name: "semester.studyroom",
      version: 2,
      migrate: (state) =>
        ({
          ...(state as Partial<StudyRoomState>),
          deletedDeckIds: [],
        }) as StudyRoomState,
      partialize: (s) => ({
        selectedDocIds: s.selectedDocIds,
        decks: s.decks,
        deletedDeckIds: s.deletedDeckIds,
        chat: s.chat,
      }),
    },
  ),
);
