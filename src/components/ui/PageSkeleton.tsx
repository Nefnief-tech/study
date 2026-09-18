export default function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="h-9 w-48 rounded-lg bg-ink/10" />
      <div className="h-4 w-72 rounded bg-ink/5" />
      <div className="space-y-3 pt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-line bg-card" />
        ))}
      </div>
    </div>
  );
}
