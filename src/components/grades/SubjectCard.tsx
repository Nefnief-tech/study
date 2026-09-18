"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import type { GradeEntry, Subject } from "@/lib/types";
import { cn, formatPoints, pointsToGrade, weightedAverage, weightSum } from "@/lib/utils";
import { GradeBadge, SubjectDot } from "@/components/ui/bits";

export default function SubjectCard({
  subject,
  entries,
  onEditSubject,
  onDeleteSubject,
  onAddGrade,
  onEditGrade,
}: {
  subject: Subject;
  entries: GradeEntry[];
  onEditSubject: (s: Subject) => void;
  onDeleteSubject: (s: Subject) => void;
  onAddGrade: (subjectId: string) => void;
  onEditGrade: (entry: GradeEntry) => void;
}) {
  const avg = weightedAverage(entries);
  const wSum = weightSum(entries);

  return (
    <section className="card flex flex-col overflow-hidden">
      <header className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <SubjectDot color={subject.color} className="size-3" />
        <h2 className="font-display text-lg font-semibold tracking-tight">{subject.name}</h2>
        <div className="ml-auto flex gap-0.5">
          <button
            className="btn-icon size-7"
            aria-label={`Edit ${subject.name}`}
            onClick={() => onEditSubject(subject)}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            className="btn-icon size-7 hover:text-marker"
            aria-label={`Delete ${subject.name}`}
            onClick={() => onDeleteSubject(subject)}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="flex items-end justify-between px-5 pt-4 pb-3">
        <div>
          <span className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">
            Schnitt
          </span>
          <p className="font-display text-4xl leading-tight font-semibold tracking-tight">
            {avg === null ? "—" : formatPoints(avg)}
            {avg !== null && (
              <span className="ml-1 font-mono text-sm text-ink-soft">Pkt.</span>
            )}
          </p>
        </div>
        {avg !== null && <GradeBadge points={avg} big />}
      </div>
      <p className="px-5 pb-3 font-mono text-[11px] text-ink-soft">
        {entries.length} {entries.length === 1 ? "grade" : "grades"} · Σ weight{" "}
        <span className={cn(entries.length > 0 && wSum !== 100 && "text-amber")}>{wSum}</span>
        {entries.length > 0 && wSum !== 100 && " (relative)"}
      </p>

      {entries.length > 0 && (
        <ul className="border-t border-line">
          {entries.map((e) => {
            const { grade, tone } = pointsToGrade(e.points);
            return (
              <li key={e.id}>
                <button
                  onClick={() => onEditGrade(e)}
                  className="grid w-full cursor-pointer grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors hover:bg-ink/[0.03]"
                >
                  <span className="truncate">
                    {e.title}
                    {e.date && (
                      <span className="ml-2 font-mono text-[10px] text-ink-soft">{e.date.slice(5)}</span>
                    )}
                  </span>
                  <span className="font-mono text-xs text-ink-soft">
                    {e.points} Pkt
                  </span>
                  <span className="chip font-mono text-[10px]">×{e.weight}</span>
                  <span
                    className={cn(
                      "text-right font-mono text-xs font-semibold",
                      tone === "good" && "text-accent",
                      tone === "ok" && "text-info",
                      tone === "warn" && "text-amber",
                      tone === "bad" && "text-marker",
                    )}
                  >
                    {grade}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-auto border-t border-line p-3">
        <button
          className="btn-ghost w-full border-dashed"
          onClick={() => onAddGrade(subject.id)}
        >
          <Plus className="size-4" /> Add grade
        </button>
      </footer>
    </section>
  );
}
