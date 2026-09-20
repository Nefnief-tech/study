"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { GradeEntry } from "@/lib/types";
import { useGradesStore, type GradeInput } from "@/lib/store/grades";
import { useSubjectsStore } from "@/lib/store/subjects";
import { pointsToGrade } from "@/lib/utils";
import { useDebouncedCallback } from "@/lib/hooks";
import Modal from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

export default function GradeFormModal({
  open,
  onClose,
  subjectId,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  /** subject the new grade belongs to (add mode) */
  subjectId?: string;
  entry?: GradeEntry;
}) {
  const subjects = useSubjectsStore((s) => s.subjects);
  const addEntry = useGradesStore((s) => s.addEntry);
  const updateEntry = useGradesStore((s) => s.updateEntry);
  const removeEntry = useGradesStore((s) => s.removeEntry);

  const [title, setTitle] = useState("");
  const [points, setPoints] = useState("");
  const [weight, setWeight] = useState("20");
  const [date, setDate] = useState("");
  // an existing entry, or the one auto-created from this form's first valid edit
  const [createdId, setCreatedId] = useState<string | undefined>(undefined);
  const targetId = entry?.id ?? createdId;
  const dirtyRef = useRef(false);

  const commit = () => {
    const p = parseFloat(points);
    const w = parseFloat(weight);
    const t = title.trim();
    if (!t || !Number.isFinite(p) || p < 0 || p > 15 || !Number.isFinite(w) || w <= 0) return;
    if (targetId) {
      updateEntry(targetId, { title: t, points: p, weight: w, date: date || undefined });
    } else {
      const sid = subjectId ?? subjects[0]?.id ?? "";
      if (!sid) return;
      const input: GradeInput = { subjectId: sid, title: t, points: p, weight: w, date: date || undefined };
      setCreatedId(addEntry(input));
    }
  };
  const commitSoon = useDebouncedCallback(() => commit(), 400);

  useEffect(() => {
    if (!open) {
      commitSoon.cancel();
      return;
    }
    setTitle(entry?.title ?? "");
    setPoints(entry ? String(entry.points) : "");
    setWeight(entry ? String(entry.weight) : "20");
    setDate(entry?.date ?? "");
    setCreatedId(undefined);
    dirtyRef.current = false;
  }, [open, entry, commitSoon]);

  /** text-ish edits: save debounced (only once title + points + weight are all valid) */
  const edit = (set: (v: string) => void) => (value: string) => {
    set(value);
    dirtyRef.current = true;
    commitSoon.run();
  };
  const close = () => {
    if (dirtyRef.current) {
      commitSoon.cancel();
      dirtyRef.current = false;
      commit();
    }
    onClose();
  };

  const preview =
    Number.isFinite(parseFloat(points)) && points !== ""
      ? pointsToGrade(parseFloat(points))
      : null;

  return (
    <Modal open={open} onClose={close} title={targetId ? "Edit grade" : "Add grade"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close();
        }}
        className="space-y-4"
      >
        <div>
          <label className="label" htmlFor="grade-title">
            Title
          </label>
          <input
            id="grade-title"
            className="field"
            autoFocus
            placeholder="e.g. Test, Abfrage, Essay"
            value={title}
            onChange={(e) => edit(setTitle)(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="grade-points">
              Punkte (0–15)
            </label>
            <input
              id="grade-points"
              type="number"
              inputMode="numeric"
              min="0"
              max="15"
              step="1"
              className="field font-mono"
              value={points}
              onChange={(e) => edit(setPoints)(e.target.value)}
            />
            {preview && (
              <p className="mt-1 font-mono text-[11px] text-ink-soft">
                = <span className={cn("font-semibold", preview.tone === "good" && "text-accent", preview.tone === "ok" && "text-info", preview.tone === "warn" && "text-amber", preview.tone === "bad" && "text-marker")}>{preview.grade}</span> ({preview.note})
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="grade-weight">
              Weight
            </label>
            <input
              id="grade-weight"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="field font-mono"
              value={weight}
              onChange={(e) => edit(setWeight)(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="grade-date">
              Date
            </label>
            <input
              id="grade-date"
              type="date"
              className="field font-mono"
              value={date}
              onChange={(e) => edit(setDate)(e.target.value)}
            />
          </div>
        </div>

        {/* quick point picker */}
        <div>
          <span className="label">Quick pick</span>
          <div className="grid grid-cols-8 gap-1.5">
            {Array.from({ length: 16 }, (_, i) => 15 - i).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPoints(String(p));
                  dirtyRef.current = true;
                  commit();
                }}
                className={cn(
                  "cursor-pointer rounded-md border py-1.5 font-mono text-xs transition-colors",
                  points === String(p)
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-card text-ink-soft hover:border-ink/30",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {!subjects.length && !targetId && (
          <p className="text-sm text-marker">Create a subject first.</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {targetId ? (
            <button
              type="button"
              className="btn-ghost text-marker hover:border-marker/40"
              onClick={() => {
                removeEntry(targetId);
                onClose();
              }}
            >
              <Trash2 className="size-4" /> Delete
            </button>
          ) : (
            <span className="text-xs text-ink-soft">Saves automatically</span>
          )}
          <button type="submit" className="btn-primary">
            Done
          </button>
        </div>
      </form>
    </Modal>
  );
}
