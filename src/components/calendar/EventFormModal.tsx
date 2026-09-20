"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { EventType, StudyEvent } from "@/lib/types";
import { useEventsStore } from "@/lib/store/events";
import type { EventInput } from "@/lib/store/events";
import { useDebouncedCallback } from "@/lib/hooks";
import Modal from "@/components/ui/Modal";
import SubjectSelect from "@/components/ui/SubjectSelect";

const TYPES: Array<{ value: EventType; label: string }> = [
  { value: "study", label: "Study session" },
  { value: "deadline", label: "Deadline" },
  { value: "exam", label: "Exam" },
  { value: "event", label: "Event" },
];

/** local-time yyyy-MM-dd, used when an untitled-and-undated entry gets saved on close */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function EventFormModal({
  open,
  onClose,
  date,
  event,
}: {
  open: boolean;
  onClose: () => void;
  date?: string;
  event?: StudyEvent;
}) {
  const addEvent = useEventsStore((s) => s.addEvent);
  const updateEvent = useEventsStore((s) => s.updateEvent);
  const removeEvent = useEventsStore((s) => s.removeEvent);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("study");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [subjectId, setSubjectId] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState("");
  // an existing event, or the one auto-created from this form's first edit
  const [createdId, setCreatedId] = useState<string | undefined>(undefined);
  const targetId = event?.id ?? createdId;
  const dirtyRef = useRef(false);

  const commit = (relaxed = false) => {
    const t = title.trim();
    const hasExtras = !!(notes.trim() || time || subjectId || type !== "study");
    // while editing, an emptied title keeps its last saved value
    if (!t && (targetId || !(relaxed && hasExtras))) return;
    if (!day && targetId) return;
    const input: EventInput = {
      title: t || "Untitled",
      date: day || today(),
      time: time || undefined,
      type,
      subjectId,
      notes: notes.trim() || undefined,
    };
    if (targetId) updateEvent(targetId, input);
    else setCreatedId(addEvent(input));
  };
  const commitSoon = useDebouncedCallback(() => commit(), 400);

  useEffect(() => {
    if (!open) {
      commitSoon.cancel();
      return;
    }
    setTitle(event?.title ?? "");
    setType(event?.type ?? "study");
    setDay(event?.date ?? date ?? "");
    setTime(event?.time ?? "");
    setSubjectId(event?.subjectId);
    setNotes(event?.notes ?? "");
    setCreatedId(undefined);
    dirtyRef.current = false;
  }, [open, event, date, commitSoon]);

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
    <Modal open={open} onClose={close} title={targetId ? "Edit entry" : "New entry"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close();
        }}
        className="space-y-4"
      >
        <div>
          <label className="label" htmlFor="event-title">
            Title
          </label>
          <input
            id="event-title"
            className="field"
            autoFocus
            placeholder="e.g. Library session, History midterm…"
            value={title}
            onChange={(e) => edit(setTitle)(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="event-date">
              Date
            </label>
            <input
              id="event-date"
              type="date"
              className="field font-mono"
              value={day}
              onChange={(e) => edit(setDay)(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="event-time">
              Time (optional)
            </label>
            <input
              id="event-time"
              type="time"
              className="field font-mono"
              value={time}
              onChange={(e) => edit(setTime)(e.target.value)}
            />
          </div>
        </div>

        <div>
          <span className="label">Type</span>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setType(t.value);
                  dirtyRef.current = true;
                  commit();
                }}
                className={
                  "cursor-pointer rounded-lg border px-3 py-2 text-xs font-medium transition-colors " +
                  (type === t.value
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-card text-ink-soft hover:border-ink/30")
                }
              >
                {t.label}
              </button>
            ))}
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
          <label className="label" htmlFor="event-notes">
            Notes (optional)
          </label>
          <textarea
            id="event-notes"
            className="field min-h-16 resize-y"
            placeholder="Room, materials to bring…"
            value={notes}
            onChange={(e) => edit(setNotes)(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {targetId ? (
            <button
              type="button"
              className="btn-ghost text-marker hover:border-marker/40"
              onClick={() => {
                removeEvent(targetId);
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
