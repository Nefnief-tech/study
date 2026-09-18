"use client";

import { useEffect, useState } from "react";
import { FileText, Layers, MessageCircle, Sparkles } from "lucide-react";
import { useHydrated } from "@/lib/hooks";
import { useStudyRoomStore } from "@/lib/store/studyroom";
import { getAuthHeaders } from "@/lib/auth/appwrite";
import { cn } from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";
import DocumentsPanel from "@/components/study-room/DocumentsPanel";
import FlashcardsPanel from "@/components/study-room/FlashcardsPanel";
import ChatPanel from "@/components/study-room/ChatPanel";

type Tab = "documents" | "flashcards" | "chat";

export default function StudyRoomPage() {
  const hydrated = useHydrated();
  const documents = useStudyRoomStore((s) => s.documents);
  const configured = useStudyRoomStore((s) => s.configured);
  const setDocuments = useStudyRoomStore((s) => s.setDocuments);
  const selectedDocIds = useStudyRoomStore((s) => s.selectedDocIds);
  const setSelectedDocs = useStudyRoomStore((s) => s.setSelectedDocs);
  const decks = useStudyRoomStore((s) => s.decks);

  const [tab, setTab] = useState<Tab>("documents");

  useEffect(() => {
    void (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/study-room/documents", { headers }).catch(() => null);
      if (!res?.ok) return;
      const json = (await res.json()) as { configured: boolean; documents: typeof documents };
      setDocuments(json.documents, json.configured);
      // first visit: tick everything; afterwards prune stale selections
      const ids = json.documents.map((d) => d.id);
      const current = useStudyRoomStore.getState().selectedDocIds;
      const pruned = current.filter((id) => ids.includes(id));
      if (pruned.length === 0) setSelectedDocs(ids);
      else if (pruned.length !== current.length) setSelectedDocs(pruned);
    })();
  }, [setDocuments, setSelectedDocs]);

  if (!hydrated) return <PageSkeleton />;

  const TABS: Array<{ id: Tab; label: string; icon: typeof FileText; badge?: number }> = [
    { id: "documents", label: "Documents", icon: FileText, badge: documents.length },
    { id: "flashcards", label: "Flashcards", icon: Layers, badge: decks.length },
    { id: "chat", label: "Chat", icon: MessageCircle },
  ];

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-4xl font-semibold tracking-tight">
            Study Room
            <Sparkles className="size-5 text-accent" />
          </h1>
          <p className="mt-1 font-mono text-xs tracking-wide text-ink-soft">
            upload material → generate flashcards → ask questions
          </p>
        </div>
        <span
          className={cn(
            "chip px-3 py-1 font-mono text-[11px] tracking-[0.1em] uppercase",
            configured ? "border-accent/40 bg-accent/10 text-accent" : "border-amber/40 bg-amber/10 text-amber",
          )}
        >
          {configured ? "AI ready" : "AI key missing"}
        </span>
      </header>

      {/* tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-line bg-card p-1">
        {TABS.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              tab === id ? "bg-ink font-medium text-paper" : "text-ink-soft hover:bg-ink/5 hover:text-ink",
            )}
          >
            <Icon className="size-4" />
            <span className="max-sm:hidden">{label}</span>
            {badge !== undefined && badge > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px font-mono text-[10px]",
                  tab === id ? "bg-paper/20 text-paper" : "bg-ink/10 text-ink-soft",
                )}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "documents" && <DocumentsPanel />}
      {tab === "flashcards" && <FlashcardsPanel configured={configured} />}
      {tab === "chat" && <ChatPanel configured={configured} />}
    </div>
  );
}
