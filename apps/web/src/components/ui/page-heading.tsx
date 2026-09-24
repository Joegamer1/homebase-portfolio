export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end">
      <div>
        <div className="section-label mb-2">{eyebrow}</div>
        <h1 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>
      </div>
    </div>
  );
}
