import { PageHeading } from "./page-heading";

export function DomainPlaceholder({
  number,
  title,
  description,
  signals,
}: {
  number: string;
  title: string;
  description: string;
  signals: string[];
}) {
  return (
    <div>
      <PageHeading eyebrow={`Workspace / ${number}`} title={title} description={description} />
      <section className="panel">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="section-label text-[var(--text)]">Foundation preview</h2>
        </div>
        <div className="grid gap-px bg-[var(--line)] sm:grid-cols-3">
          {signals.map((signal, i) => (
            <div className="bg-[var(--panel)] p-4" key={signal}>
              <div className="mono text-[9px] text-[var(--faint)]">0{i + 1}</div>
              <div className="mt-4 text-xs text-[var(--muted)]">{signal}</div>
              <div className="mono mt-2 text-[9px] text-[var(--faint)]">AWAITING FUTURE COLLECTOR</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
