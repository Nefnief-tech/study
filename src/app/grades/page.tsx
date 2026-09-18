"use client";

import { useMemo, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import type { GradeEntry, Subject } from "@/lib/types";
import { useSubjectsStore } from "@/lib/store/subjects";
import { useGradesStore } from "@/lib/store/grades";
import { useHydrated } from "@/lib/hooks";
import { formatPoints, weightedAverage } from "@/lib/utils";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { EmptyState, GradeBadge } from "@/components/ui/bits";
import PointsTable from "@/components/grades/PointsTable";
import SubjectCard from "@/components/grades/SubjectCard";
import SubjectFormModal from "@/components/grades/SubjectFormModal";
import GradeFormModal from "@/components/grades/GradeFormModal";

export default function GradesPage() {
  const hydrated = useHydrated();
  const subjects = useSubjectsStore((s) => s.subjects);
  const entries = useGradesStore((s) => s.entries);
  const removeSubject = useSubjectsStore((s) => s.removeSubject);

  const [subjectModal, setSubjectModal] = useState<{ open: boolean; subject?: Subject }>({
    open: false,
  });
  const [gradeModal, setGradeModal] = useState<{
    open: boolean;
    subjectId?: string;
    entry?: GradeEntry;
  }>({ open: false });

  const overall = useMemo(() => weightedAverage(entries), [entries]);
  const entriesBySubject = useMemo(() => {
    const map = new Map<string, GradeEntry[]>();
    for (const e of entries) {
      const list = map.get(e.subjectId ?? "") ?? [];
      list.push(e);
      map.set(e.subjectId ?? "", list);
    }
    for (const list of map.values())
      list.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    return map;
  }, [entries]);

  const deleteSubject = (subject: Subject) => {
    const count = entriesBySubject.get(subject.id)?.length ?? 0;
    const ok = window.confirm(
      `Delete “${subject.name}”?` +
        (count > 0 ? ` This also removes its ${count} grade${count === 1 ? "" : "s"}.` : ""),
    );
    if (ok) removeSubject(subject.id);
  };

  if (!hydrated) return <PageSkeleton />;

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Grades</h1>
          <p className="mt-1 font-mono text-xs tracking-wide text-ink-soft">
            Punkte system (0–15) · weighted averages
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setSubjectModal({ open: true })}>
            <Plus className="size-4" /> Subject
          </button>
          <button
            className="btn-primary"
            onClick={() => setGradeModal({ open: true })}
            disabled={subjects.length === 0}
          >
            <Plus className="size-4" /> Add grade
          </button>
        </div>
      </header>

      {/* overall */}
      <div className="card mb-8 flex flex-wrap items-center gap-x-8 gap-y-4 px-6 py-5">
        <div>
          <span className="font-mono text-[10px] tracking-[0.14em] text-ink-soft uppercase">
            overall average
          </span>
          <p className="font-display text-5xl leading-tight font-semibold tracking-tight">
            {overall === null ? "—" : formatPoints(overall)}
            {overall !== null && (
              <span className="ml-2 font-mono text-base text-ink-soft">Pkt.</span>
            )}
          </p>
        </div>
        {overall !== null && <GradeBadge points={overall} big />}
        <p className="ml-auto max-w-64 text-right font-mono text-[11px] leading-relaxed text-ink-soft">
          across {subjects.length} {subjects.length === 1 ? "subject" : "subjects"} ·{" "}
          {entries.length} graded {entries.length === 1 ? "item" : "items"}
        </p>
      </div>

      <PointsTable />

      {subjects.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<BookOpen className="size-8" />}
            title="No subjects yet"
            hint="Subjects are shared across tasks, grades and the calendar. Create one to start tracking grades."
            action={
              <button className="btn-primary" onClick={() => setSubjectModal({ open: true })}>
                <Plus className="size-4" /> New subject
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {subjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              entries={entriesBySubject.get(subject.id) ?? []}
              onEditSubject={(s) => setSubjectModal({ open: true, subject: s })}
              onDeleteSubject={deleteSubject}
              onAddGrade={(id) => setGradeModal({ open: true, subjectId: id })}
              onEditGrade={(entry) => setGradeModal({ open: true, entry })}
            />
          ))}
        </div>
      )}

      <SubjectFormModal
        open={subjectModal.open}
        subject={subjectModal.subject}
        onClose={() => setSubjectModal({ open: false })}
      />
      <GradeFormModal
        open={gradeModal.open}
        subjectId={gradeModal.subjectId}
        entry={gradeModal.entry}
        onClose={() => setGradeModal({ open: false })}
      />
    </div>
  );
}
