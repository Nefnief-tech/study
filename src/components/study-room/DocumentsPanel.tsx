"use client";

import { useState, useRef } from "react";
import { ID, Storage } from "appwrite";
import {
  FileText,
  Presentation,
  StickyNote,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { DocKind, StudyDoc } from "@/lib/types";
import { useStudyRoomStore } from "@/lib/store/studyroom";
import { STORAGE_BUCKET_ID, appwriteClient, getAuthHeaders } from "@/lib/auth/appwrite";
import { cn, formatBytes } from "@/lib/utils";
import { EmptyState, SubjectDot } from "@/components/ui/bits";

const KIND_ICONS: Record<DocKind, LucideIcon> = {
  pdf: FileText,
  docx: FileText,
  pptx: Presentation,
  txt: StickyNote,
  md: StickyNote,
};

const ERRORS: Record<string, string> = {
  unsupported_type: "Unsupported file type — use PDF, DOCX, PPTX, TXT or MD.",
  too_large: "That file is larger than 20 MB.",
  extract_failed: "Couldn't read this file. Scanned PDFs without a text layer aren't supported.",
  no_text: "No extractable text found in this file.",
  missing_file: "Upload failed — try again.",
  auth_required: "Sign in first — use “Sign in to sync” in the sidebar.",
};

export default function DocumentsPanel() {
  const documents = useStudyRoomStore((s) => s.documents);
  const addDocument = useStudyRoomStore((s) => s.addDocument);
  const removeDocument = useStudyRoomStore((s) => s.removeDocument);
  const selectedDocIds = useStudyRoomStore((s) => s.selectedDocIds);
  const toggleSelectedDoc = useStudyRoomStore((s) => s.toggleSelectedDoc);

  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [bucketWarn, setBucketWarn] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: File[]) => {
    setError("");
    for (const file of files) {
      setUploading((u) => [...u, file.name]);

      // 1. persist the raw file in the Appwrite storage bucket (best-effort —
      //    extraction keeps working locally if the bucket isn't provisioned)
      let bucketFileId: string | undefined;
      if (appwriteClient) {
        try {
          const res = await new Storage(appwriteClient).createFile(
            STORAGE_BUCKET_ID,
            ID.unique(),
            file,
          );
          bucketFileId = res.$id;
        } catch {
          setBucketWarn(true);
        }
      }

      // 2. text extraction on the server (feeds chat + flashcards)
      const body = new FormData();
      body.append("file", file);
      if (bucketFileId) body.append("bucketFileId", bucketFileId);
      const res = await fetch("/api/study-room/documents", {
        method: "POST",
        body,
        headers: await getAuthHeaders(),
      });
      setUploading((u) => u.filter((n) => n !== file.name));
      const json = (await res.json().catch(() => null)) as StudyDoc | { error?: string } | null;
      if (!res.ok) {
        setError(ERRORS[json && "error" in json ? json.error! : ""] ?? "Upload failed — try again.");
        continue;
      }
      if (json && "id" in json) addDocument(json);
    }
  };

  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload(Array.from(e.dataTransfer.files));
  };

  const remove = async (doc: StudyDoc) => {
    removeDocument(doc.id);
    await fetch(`/api/study-room/documents/${doc.id}`, {
      method: "DELETE",
      headers: await getAuthHeaders(),
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        {/* dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-accent bg-accent-soft/50" : "border-line bg-card hover:border-accent/50",
          )}
        >
          <div className="mb-3 grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
            <Upload className="size-5" />
          </div>
          <p className="font-display text-lg font-semibold tracking-tight">Drop your material here</p>
          <p className="mt-1 text-xs text-ink-soft">
            PDFs, slides (PPTX), DOCX or plain notes (TXT/MD) · up to 20 MB
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.pptx,.txt,.md,.markdown"
            className="hidden"
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>

        {error && <p className="mt-3 text-sm text-marker">{error}</p>}
        {bucketWarn && !error && (
          <p className="mt-3 text-xs text-ink-soft">
            File processed, but cloud storage isn't provisioned yet — the raw file was kept out of
            the bucket. Run <code className="font-mono">appwrite push storage</code> to enable it.
          </p>
        )}

        {uploading.length > 0 && (
          <p className="mt-3 animate-pulse font-mono text-xs text-ink-soft">
            extracting text · {uploading.join(", ")}…
          </p>
        )}

        {/* document list */}
        {documents.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No documents yet"
              hint="Upload lecture notes, slides or chapters — they become the context for flashcards and chat."
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {documents.map((doc) => {
              const Icon = KIND_ICONS[doc.kind];
              const selected = selectedDocIds.includes(doc.id);
              return (
                <li
                  key={doc.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors",
                    selected ? "border-accent/50" : "border-line",
                  )}
                >
                  <button
                    onClick={() => toggleSelectedDoc(doc.id)}
                    aria-label={selected ? "Exclude from AI context" : "Include in AI context"}
                    title={selected ? "Used for flashcards & chat" : "Not used for AI"}
                    className={cn(
                      "grid size-5 shrink-0 cursor-pointer place-items-center rounded-md border transition-colors",
                      selected ? "border-accent bg-accent text-paper" : "border-ink/30 hover:border-accent",
                    )}
                  >
                    {selected && (
                      <span className="text-[10px] leading-none font-bold">✓</span>
                    )}
                  </button>
                  <Icon className="size-4 shrink-0 text-ink-soft" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    <p className="font-mono text-[10px] text-ink-soft">
                      {formatBytes(doc.size)} · {doc.chars.toLocaleString("de-DE")} chars ·{" "}
                      {new Date(doc.uploadedAt).toLocaleDateString("de-DE")}
                    </p>
                  </div>
                  <button
                    className="btn-icon size-7 hover:text-marker"
                    aria-label={`Delete ${doc.name}`}
                    onClick={() => void remove(doc)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* context summary */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <h3 className="font-display text-base font-semibold tracking-tight">AI context</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Ticked documents are sent to the AI when you generate flashcards or chat. Nothing is
            uploaded anywhere except to your own AI provider.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <SubjectDot color="var(--accent)" />
            <span className="font-mono text-xs text-ink-soft">
              {selectedDocIds.length} of {documents.length} selected
            </span>
          </div>
          {documents.length > 0 && selectedDocIds.length < documents.length && (
            <button
              className="btn-ghost mt-4 w-full"
              onClick={() =>
                useStudyRoomStore.getState().setSelectedDocs(documents.map((d) => d.id))
              }
            >
              Select all
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
