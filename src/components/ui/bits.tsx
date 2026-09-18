"use client";

import { Clock, Flag } from "lucide-react";
import type { Priority } from "@/lib/types";
import { cn, dueInfo, pointsToGrade, TONE_CLASSES, type Tone } from "@/lib/utils";

export function SubjectDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

export function SubjectTag({ name, color }: { name: string; color: string }) {
  return (
    <span className="chip">
      <SubjectDot color={color} />
      {name}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone: Record<Priority, Tone> = {
    high: "bad",
    medium: "warn",
    low: "neutral",
  };
  return (
    <span className={cn("chip font-mono uppercase", TONE_CLASSES[tone[priority]])}>
      <Flag className="size-3" />
      {priority}
    </span>
  );
}

export function DueChip({ due, done }: { due?: string; done?: boolean }) {
  const info = dueInfo(due);
  if (!info) return null;
  const alarming = info.overdue && !done;
  const hot = !alarming && info.isToday && !done;
  return (
    <span
      className={cn(
        "chip font-mono",
        alarming && "border-marker/40 bg-marker/10 text-marker",
        hot && "border-amber/40 bg-amber/10 text-amber",
      )}
    >
      <Clock className="size-3" />
      {alarming ? `Overdue — ${info.label}` : info.label}
    </span>
  );
}

/** German grade badge — e.g. "1,7" or "4,0" */
/** German Punkte → classic +/− grade badge, e.g. "12 Pkt = 2+" */
export function GradeBadge({ points, big = false }: { points: number; big?: boolean }) {
  const { grade, tone } = pointsToGrade(points);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-mono font-semibold",
        TONE_CLASSES[tone],
        big ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]",
      )}
    >
      {big && <span className="font-normal">{points.toFixed(1).replace(".", ",")} →</span>}
      {grade}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-card/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-soft">{icon}</div>}
      <p className="font-display text-lg font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-soft">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
