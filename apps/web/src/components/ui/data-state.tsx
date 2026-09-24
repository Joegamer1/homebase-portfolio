export function LoadingState() {
  return (
    <section className="panel p-6" role="status">
      <p className="mt-3 text-sm text-[var(--muted)]">Loading…</p>
    </section>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <section className="panel border-[var(--red)] p-6" role="alert">
      <div className="section-label text-[var(--red)]">Unable to load data</div>
      <p className="mt-3 text-sm text-[var(--muted)]">HOMEBASE could not load this page. Please try again.</p>
      <details className="mt-3 text-xs">
        <summary>Connection details</summary>
        <p>{message}</p>
      </details>
    </section>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <section className="panel p-6">
      <div className="section-label">No active items</div>
      <p className="mt-3 text-sm text-[var(--muted)]">{label}</p>
    </section>
  );
}

export function Freshness({
  stale,
  mode = "mock",
}: {
  stale: boolean;
  generatedAt: string;
  mode?: "mock" | "mixed" | "live";
}) {
  if (!stale && mode === "live") return null;
  return (
    <p role="status" className="mb-3 text-xs text-[var(--amber)]">
      {stale
        ? "Some information may be out of date."
        : mode === "mixed"
          ? "Some sections show demo data."
          : "Showing demo data."}
    </p>
  );
}
