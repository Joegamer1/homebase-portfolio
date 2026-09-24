const colors: Record<string, string> = { CAREER: "var(--violet)", LAB: "var(--cyan)", PERSONAL: "var(--green)" };
export function FocusPanel({ goals }: { goals: Array<{ domain: string; title: string; progress: number }> }) {
  return (
    <section className="panel" aria-labelledby="focus-heading">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 id="focus-heading" className="section-label text-[var(--text)]">
          Focus
        </h2>
      </div>
      {!goals.length && <p className="p-4 text-xs text-[var(--muted)]">No tracked goals configured yet.</p>}
      <div className="divide-y divide-[var(--line)]">
        {goals.map((goal) => (
          <div key={goal.domain} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div
                  className="mono text-[9px] tracking-[0.1em]"
                  style={{ color: colors[goal.domain] ?? "var(--muted)" }}
                >
                  {goal.domain}
                </div>
                <div className="mt-1 text-[11px] text-[var(--muted)]">{goal.title}</div>
              </div>
              <div className="mono text-[10px] text-[var(--text)]">{goal.progress}%</div>
            </div>
            <div className="mt-2 h-px bg-[var(--line)]">
              <div
                className="h-px"
                style={{ width: `${goal.progress}%`, background: colors[goal.domain] ?? "var(--muted)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
