export function TodayPanel({
  events,
  outlook,
}: {
  events: Array<{ id: string; time: string; title: string; meta: string }>;
  outlook?: { nextSevenDaysCount: number; nextEvent?: string; stale: boolean };
}) {
  return (
    <section className="panel h-full" aria-labelledby="today-heading">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 id="today-heading" className="section-label text-[var(--text)]">
          Family calendar
        </h2>
      </div>
      {outlook && (
        <p className="border-b border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">
          {outlook.nextSevenDaysCount} events in the next 7 days
          {outlook.nextEvent ? ` · Next: ${outlook.nextEvent}` : ""}
          {outlook.stale ? " · Calendar data may be stale" : ""}
        </p>
      )}
      {!events.length && <p className="p-4 text-xs text-[var(--muted)]">No events scheduled today.</p>}
      <a href="/family" className="block px-4 py-2 text-xs text-[var(--cyan)]">
        Next 7 days →
      </a>
      <div className="divide-y divide-[var(--line)]">
        {events.map((event) => (
          <div key={event.id} className="grid grid-cols-[48px_1fr] gap-3 px-4 py-3">
            <time className="mono text-[10px] text-[var(--cyan)]">{event.time}</time>
            <div>
              <div className="text-xs text-[var(--text)]">{event.title}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
