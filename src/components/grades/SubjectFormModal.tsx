"use client";

import { useEffect, useRef, useState } from "react";
import { useSubjectsStore } from "@/lib/store/subjects";
import { PALETTE } from "@/lib/utils";
import { useDebouncedCallback } from "@/lib/hooks";
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
  // an existing subject, or the one auto-created from this form's first edit
  const [createdId, setCreatedId] = useState<string | undefined>(undefined);
  const targetId = subject?.id ?? createdId;
  const dirtyRef = useRef(false);
  const initialColor = useRef("");

  const commit = (relaxed = false) => {
    const n = name.trim();
    const hasContent = n.length > 0 || color !== initialColor.current;
    // while editing, an emptied name keeps its last saved value
    if (!n && (targetId || !(relaxed && hasContent))) return;
    const payload = { name: n || "Untitled", color };
    if (targetId) updateSubject(targetId, payload);
    else setCreatedId(addSubject(payload).id);
  };
  const commitSoon = useDebouncedCallback(() => commit(), 400);

  useEffect(() => {
    if (!open) {
      commitSoon.cancel();
      return;
    }
    setName(subject?.name ?? "");
    initialColor.current = subject?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)];
    setColor(initialColor.current);
    setCreatedId(undefined);
    dirtyRef.current = false;
  }, [open, subject, commitSoon]);

  const close = () => {
    if (dirtyRef.current) {
      commitSoon.cancel();
      dirtyRef.current = false;
      commit(true);
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={targetId ? "Edit subject" : "New subject"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close();
        }}
        className="space-y-4"
      >
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
            onChange={(e) => {
              setName(e.target.value);
              dirtyRef.current = true;
              commitSoon.run();
            }}
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
                onClick={() => {
                  setColor(c);
                  dirtyRef.current = true;
                  commit();
                }}
                className={cn(
                  "size-8 cursor-pointer rounded-full border-2 transition-transform hover:scale-110",
                  color === c ? "border-ink" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
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
