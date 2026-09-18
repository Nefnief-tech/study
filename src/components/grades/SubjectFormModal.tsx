"use client";

import { useEffect, useState } from "react";
import { useSubjectsStore } from "@/lib/store/subjects";
import { PALETTE } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

export default function SubjectFormModal({
  open,
  onClose,
  subject,
}: {
  open: boolean;
  onClose: () => void;
  /** when set, the modal edits the existing subject instead of creating one */
  subject?: { id: string; name: string; color: string };
}) {
  const addSubject = useSubjectsStore((s) => s.addSubject);
  const updateSubject = useSubjectsStore((s) => s.updateSubject);

  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(subject?.name ?? "");
    setColor(subject?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    setError("");
  }, [open, subject]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the subject a name.");
      return;
    }
    if (subject) updateSubject(subject.id, { name, color });
    else addSubject({ name, color });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={subject ? "Edit subject" : "New subject"}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="subject-name">
            Name
          </label>
          <input
            id="subject-name"
            className="field"
            autoFocus
            placeholder="e.g. Mathematics"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <span className="label">Color</span>
          <div className="flex gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Pick color ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  "size-8 cursor-pointer rounded-full border-2 transition-transform hover:scale-110",
                  color === c ? "border-ink" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-marker">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {subject ? "Save changes" : "Add subject"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
