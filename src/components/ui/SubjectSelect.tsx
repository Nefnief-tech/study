"use client";

import { useState } from "react";
import { useSubjectsStore } from "@/lib/store/subjects";

/**
 * Subject picker used by the task and event forms. Includes an inline
 * "new subject" flow so subjects can be created from anywhere.
 */
export default function SubjectSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (subjectId: string | undefined) => void;
}) {
  const subjects = useSubjectsStore((s) => s.subjects);
  const addSubject = useSubjectsStore((s) => s.addSubject);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const subject = addSubject({ name: trimmed });
    setName("");
    setCreating(false);
    onChange(subject.id);
  };

  return (
    <div>
      <label className="label" htmlFor="subject-select">
        Subject
      </label>
      <select
        id="subject-select"
        className="field"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__new") {
            setCreating(true);
            return;
          }
          onChange(v || undefined);
        }}
      >
        <option value="">No subject</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value="__new">+ New subject…</option>
      </select>

      {creating && (
        <div className="mt-2 flex gap-2">
          <input
            className="field"
            autoFocus
            placeholder="e.g. Mathematics"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
          />
          <button type="button" className="btn-primary shrink-0" onClick={create} disabled={!name.trim()}>
            Add
          </button>
          <button
            type="button"
            className="btn-ghost shrink-0"
            onClick={() => {
              setCreating(false);
              setName("");
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
