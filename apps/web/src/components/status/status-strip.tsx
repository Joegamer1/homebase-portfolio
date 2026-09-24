const colors = { healthy: "var(--green)", warning: "var(--amber)", critical: "var(--red)" };
export function StatusStrip({
  entries,
}: {
  entries: Array<{ domain: string; value: string; state: keyof typeof colors }>;
}) {
  return (
    <section className="overflow-x-auto" aria-label="Domain status">
      <div className="flex min-w-max gap-2">
        {entries.map((entry) => (
          <div
            key={entry.domain}
            className="soft-card flex min-w-[140px] flex-1 items-center justify-between gap-5 px-4 py-3"
          >
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: colors[entry.state] }} />
              <span className="section-label">{entry.domain}</span>
            </span>
            <span className="mono text-[11px] font-bold text-[var(--text)]">{entry.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
