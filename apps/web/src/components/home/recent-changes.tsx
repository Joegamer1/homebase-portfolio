export function RecentChanges({
  changes,
}: {
  changes: Array<{ id: string; age: string; source: string; summary: string }>;
}) {
  return (
    <section className="panel" aria-labelledby="changes-heading">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 id="changes-heading" className="section-label text-[var(--text)]">
          Recent changes
        </h2>
      </div>
      {!changes.length && (
        <p className="p-4 text-xs text-[var(--muted)]">
          Change history is not available yet. Current conditions appear in Attention.
        </p>
      )}
      <div className="divide-y divide-[var(--line)]">
        {changes.map((change) => (
          <div key={change.id} className="grid grid-cols-[34px_96px_1fr] gap-2 px-4 py-2.5 text-[10px]">
            <span className="mono text-[var(--faint)]">{change.age}</span>
            <span className="text-[var(--muted)]">{change.source}</span>
            <span className="text-[var(--text)]">{change.summary}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
