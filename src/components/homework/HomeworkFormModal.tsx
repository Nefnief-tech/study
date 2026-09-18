"use client";

import { useEffect, useState } from "react";
import type { Homework, Priority } from "@/lib/types";
import { useHomeworkStore } from "@/lib/store/homework";
import { PRIORITY_LABEL } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import SubjectSelect from "@/components/ui/SubjectSelect";
import { cn } from "@/lib/utils";

const PRIORITIES: Priority[] = ["low", "medium", "high"];

export default function HomeworkFormModal({
  open,
  onClose,
  homework,
}: {
  open: boolean;
  onClose: () => void;
  homework?: Homework;
}) {
  const addHomework = useHomeworkStore((s) => s.addHomework);
  const updateHomework = useHomeworkStore((s) => s.updateHomework);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [subjectId, setSubjectId] = useState<string | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(homework?.title ?? "");
    setNotes(homework?.notes ?? "");
    setDue(homework?.due ?? "");
    setPriority(homework?.priority ?? "medium");
    setSubjectId(homework?.subjectId);
    setError("");
  }, [open, homework]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the homework a title.");
      return;
    }
    if (homework) {
      updateHomework(homework.id, {
        title,
        notes: notes.trim() || undefined,
        due: due || undefined,
        priority,
        subjectId,
      });
    } else {
      addHomework({
        title,
        notes: notes.trim() || undefined,
        due: due || undefined,
        priority,
        subjectId,
      });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={homework ? "Edit homework" : "New homework"}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="hw-title">
            Title
          </label>
          <input
            id="hw-title"
            className="field"
            autoFocus
            placeholder="e.g. Worksheet: quadratic equations"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="hw-due">
              Due (optional)
            </label>
            <input
              id="hw-due"
              type="datetime-local"
              className="field font-mono"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <div>
            <span className="label">Priority</span>
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    "flex-1 cursor-pointer rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    priority === p
                      ? "border-ink bg-ink text-paper"
                      : "border-line bg-card text-ink-soft hover:border-ink/30",
                  )}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SubjectSelect value={subjectId} onChange={setSubjectId} />

        <div>
          <label className="label" htmlFor="hw-notes">
            Notes (optional)
          </label>
          <textarea
            id="hw-notes"
            className="field min-h-20 resize-y"
            placeholder="Page numbers, exercises, links…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-marker">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {homework ? "Save changes" : "Add homework"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
