"use client";

import { useEffect, useRef, useState } from "react";
import type { Priority, Todo } from "@/lib/types";
import { useTodosStore } from "@/lib/store/todos";
import type { TodoInput } from "@/lib/store/todos";
import { PRIORITY_LABEL } from "@/lib/utils";
import { useDebouncedCallback } from "@/lib/hooks";
import Modal from "@/components/ui/Modal";
import SubjectSelect from "@/components/ui/SubjectSelect";
import { cn } from "@/lib/utils";

const PRIORITIES: Priority[] = ["low", "medium", "high"];

export default function TodoFormModal({
  open,
  onClose,
  todo,
}: {
  open: boolean;
  onClose: () => void;
  todo?: Todo;
}) {
  const addTodo = useTodosStore((s) => s.addTodo);
  const updateTodo = useTodosStore((s) => s.updateTodo);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [subjectId, setSubjectId] = useState<string | undefined>(undefined);
  // an existing todo, or the one auto-created from this form's first edit
  const [createdId, setCreatedId] = useState<string | undefined>(undefined);
  const targetId = todo?.id ?? createdId;
  const dirtyRef = useRef(false);

  const commit = (relaxed = false) => {
    const t = title.trim();
    const hasExtras = !!(notes.trim() || due || subjectId);
    // while editing, an emptied title keeps its last saved value
    if (!t && (targetId || !(relaxed && hasExtras))) return;
    const input: TodoInput = {
      title: t || "Untitled",
      notes: notes.trim() || undefined,
      due: due || undefined,
      priority,
      subjectId,
    };
    if (targetId) updateTodo(targetId, input);
    else setCreatedId(addTodo(input));
  };
  const commitSoon = useDebouncedCallback(() => commit(), 400);

  useEffect(() => {
    if (!open) {
      commitSoon.cancel();
      return;
    }
    setTitle(todo?.title ?? "");
    setNotes(todo?.notes ?? "");
    setDue(todo?.due ?? "");
    setPriority(todo?.priority ?? "medium");
    setSubjectId(todo?.subjectId);
    setCreatedId(undefined);
    dirtyRef.current = false;
  }, [open, todo, commitSoon]);

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
    <Modal open={open} onClose={close} title={targetId ? "Edit task" : "New task"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close();
        }}
        className="space-y-4"
      >
        <div>
          <label className="label" htmlFor="todo-title">
            Title
          </label>
          <input
            id="todo-title"
            className="field"
            autoFocus
            placeholder="e.g. Linear algebra problem set 4"
            value={title}
            onChange={(e) => edit(setTitle)(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="todo-due">
              Due (optional)
            </label>
            <input
              id="todo-due"
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
          <label className="label" htmlFor="todo-notes">
            Notes (optional)
          </label>
          <textarea
            id="todo-notes"
            className="field min-h-20 resize-y"
            placeholder="Chapters, page numbers, links…"
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
