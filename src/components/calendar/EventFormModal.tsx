"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { EventType, StudyEvent } from "@/lib/types";
import { useEventsStore } from "@/lib/store/events";
import Modal from "@/components/ui/Modal";
import SubjectSelect from "@/components/ui/SubjectSelect";

const TYPES: Array<{ value: EventType; label: string }> = [
  { value: "study", label: "Study session" },
  { value: "deadline", label: "Deadline" },
  { value: "exam", label: "Exam" },
  { value: "event", label: "Event" },
];

export default function EventFormModal({
  open,
  onClose,
  /** preselected date (yyyy-MM-dd) when creating from a calendar cell */
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
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? "");
    setType(event?.type ?? "study");
    setDay(event?.date ?? date ?? "");
    setTime(event?.time ?? "");
    setSubjectId(event?.subjectId);
    setNotes(event?.notes ?? "");
    setError("");
  }, [open, event, date]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("Give it a title.");
    if (!day) return setError("Pick a date.");
    const payload = {
      title,
      date: day,
      time: time || undefined,
      type,
      subjectId,
      notes: notes.trim() || undefined,
    };
    if (event) updateEvent(event.id, payload);
    else addEvent(payload);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={event ? "Edit entry" : "New entry"}>
      <form onSubmit={submit} className="space-y-4">
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
            onChange={(e) => setTitle(e.target.value)}
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
              onChange={(e) => setDay(e.target.value)}
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
              onChange={(e) => setTime(e.target.value)}
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
                onClick={() => setType(t.value)}
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

        <SubjectSelect value={subjectId} onChange={setSubjectId} />

        <div>
          <label className="label" htmlFor="event-notes">
            Notes (optional)
          </label>
          <textarea
            id="event-notes"
            className="field min-h-16 resize-y"
            placeholder="Room, materials to bring…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-marker">{error}</p>}

        <div className="flex justify-between gap-2 pt-1">
          {event ? (
            <button
              type="button"
              className="btn-ghost text-marker hover:border-marker/40"
              onClick={() => {
                removeEvent(event.id);
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
              {event ? "Save changes" : "Add entry"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
