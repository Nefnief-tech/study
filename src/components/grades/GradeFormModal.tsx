"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { GradeEntry } from "@/lib/types";
import { useGradesStore, type GradeInput } from "@/lib/store/grades";
import { useSubjectsStore } from "@/lib/store/subjects";
import { pointsToGrade } from "@/lib/utils";
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
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(entry?.title ?? "");
    setPoints(entry ? String(entry.points) : "");
    setWeight(entry ? String(entry.weight) : "20");
    setDate(entry?.date ?? "");
    setError("");
  }, [open, entry]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(points);
    const w = parseFloat(weight);
    if (!title.trim()) return setError("What was graded? Add a title.");
    if (!Number.isFinite(p) || p < 0 || p > 15) return setError("Points must be between 0 and 15.");
    if (!Number.isFinite(w) || w <= 0) return setError("Weight must be a positive number.");
    const trimmedTitle = title.trim();
    if (entry) {
      updateEntry(entry.id, { title: trimmedTitle, points: p, weight: w, date: date || undefined });
    } else {
      const input: GradeInput = {
        subjectId: subjectId ?? subjects[0]?.id ?? "",
        title: trimmedTitle,
        points: p,
        weight: w,
        date: date || undefined,
      };
      if (!input.subjectId) {
        setError("Create a subject first.");
        return;
      }
      addEntry(input);
    }
    onClose();
  };

  const preview =
    Number.isFinite(parseFloat(points)) && points !== ""
      ? pointsToGrade(parseFloat(points))
      : null;

  return (
    <Modal open={open} onClose={onClose} title={entry ? "Edit grade" : "Add grade"}>
      <form onSubmit={submit} className="space-y-4">
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
            onChange={(e) => setTitle(e.target.value)}
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
              onChange={(e) => setPoints(e.target.value)}
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
              onChange={(e) => setWeight(e.target.value)}
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
              onChange={(e) => setDate(e.target.value)}
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
                onClick={() => setPoints(String(p))}
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

        {error && <p className="text-sm text-marker">{error}</p>}

        <div className="flex justify-between gap-2 pt-1">
          {entry ? (
            <button
              type="button"
              className="btn-ghost text-marker hover:border-marker/40"
              onClick={() => {
                removeEntry(entry.id);
                onClose();
              }}
            >
              <Trash2 className="size-4" /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {entry ? "Save changes" : "Add grade"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
