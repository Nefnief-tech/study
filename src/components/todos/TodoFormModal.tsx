"use client";

import { useEffect, useState } from "react";
import type { Priority, Todo } from "@/lib/types";
import { useTodosStore } from "@/lib/store/todos";
import { PRIORITY_LABEL } from "@/lib/utils";
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
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(todo?.title ?? "");
    setNotes(todo?.notes ?? "");
    setDue(todo?.due ?? "");
    setPriority(todo?.priority ?? "medium");
    setSubjectId(todo?.subjectId);
    setError("");
  }, [open, todo]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the task a title.");
      return;
    }
    if (todo) {
      updateTodo(todo.id, {
        title,
        notes: notes.trim() || undefined,
        due: due || undefined,
        priority,
        subjectId,
      });
    } else {
      addTodo({
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
    <Modal open={open} onClose={onClose} title={todo ? "Edit task" : "New task"}>
      <form onSubmit={submit} className="space-y-4">
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
            onChange={(e) => setTitle(e.target.value)}
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
          <label className="label" htmlFor="todo-notes">
            Notes (optional)
          </label>
          <textarea
            id="todo-notes"
            className="field min-h-20 resize-y"
            placeholder="Chapters, page numbers, links…"
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
            {todo ? "Save changes" : "Add task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
