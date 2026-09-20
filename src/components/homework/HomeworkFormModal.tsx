"use client";

import { useEffect, useRef, useState } from "react";
import type { Homework, Priority } from "@/lib/types";
import { useHomeworkStore } from "@/lib/store/homework";
import type { HomeworkInput } from "@/lib/store/homework";
import { PRIORITY_LABEL } from "@/lib/utils";
import { useDebouncedCallback } from "@/lib/hooks";
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
  // an existing homework, or the one auto-created from this form's first edit
  const [createdId, setCreatedId] = useState<string | undefined>(undefined);
  const targetId = homework?.id ?? createdId;
  const dirtyRef = useRef(false);

  const commit = (relaxed = false) => {
    const t = title.trim();
    const hasExtras = !!(notes.trim() || due || subjectId);
    // while editing, an emptied title keeps its last saved value
    if (!t && (targetId || !(relaxed && hasExtras))) return;
    const input: HomeworkInput = {
      title: t || "Untitled",
      notes: notes.trim() || undefined,
      due: due || undefined,
      priority,
      subjectId,
    };
    if (targetId) updateHomework(targetId, input);
    else setCreatedId(addHomework(input));
  };
  const commitSoon = useDebouncedCallback(() => commit(), 400);

  useEffect(() => {
    if (!open) {
      commitSoon.cancel();
      return;
    }
    setTitle(homework?.title ?? "");
    setNotes(homework?.notes ?? "");
    setDue(homework?.due ?? "");
    setPriority(homework?.priority ?? "medium");
    setSubjectId(homework?.subjectId);
    setCreatedId(undefined);
    dirtyRef.current = false;
  }, [open, homework, commitSoon]);

  /** text-ish edits: save debounced */
  const edit = (set: (v: string) => void) => (value: string) => {
    set(value);
    dirtyRef.current = true;
    commitSoon.run();
  };
  const close = () => {
    if (dirtyRef.current) {
      commitSoon.cancel();
      dirtyRef.current = false;
      commit(true);
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={targetId ? "Edit homework" : "New homework"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close();
        }}
        className="space-y-4"
      >
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
            onChange={(e) => edit(setTitle)(e.target.value)}
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
              onChange={(e) => edit(setDue)(e.target.value)}
            />
          </div>
          <div>
            <span className="label">Priority</span>
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPriority(p);
                    dirtyRef.current = true;
                    commit();
                  }}
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

        <SubjectSelect
          value={subjectId}
          onChange={(v) => {
            setSubjectId(v);
            dirtyRef.current = true;
            commit();
          }}
        />

        <div>
          <label className="label" htmlFor="hw-notes">
            Notes (optional)
          </label>
          <textarea
            id="hw-notes"
            className="field min-h-20 resize-y"
            placeholder="Page numbers, exercises, links…"
            value={notes}
            onChange={(e) => edit(setNotes)(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-ink-soft">Saves automatically</span>
          <button type="submit" className="btn-primary">
            Done
          </button>
        </div>
      </form>
    </Modal>
  );
}
