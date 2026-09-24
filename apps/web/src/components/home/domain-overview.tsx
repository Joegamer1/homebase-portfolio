import Link from "next/link";
import type { AttentionItem } from "@homebase/api-contracts";

const domains = [
  { id: "lab", label: "Lab", href: "/lab", color: "var(--cyan)" },
  { id: "security", label: "Security", href: "/security", color: "var(--red)" },
  { id: "career", label: "Career", href: "/career", color: "var(--violet)" },
  { id: "games", label: "Games", href: "/games", color: "var(--amber)" },
  { id: "family", label: "Family", href: "/family", color: "var(--green)" },
  { id: "system", label: "System", href: "/system", color: "var(--muted)" },
] as const;

const stateCopy = { healthy: "Clear", warning: "Review", critical: "Act now" };
const stateColor = { healthy: "var(--green)", warning: "var(--amber)", critical: "var(--red)" };

export function DomainOverview({
  items,
  statuses,
}: {
  items: AttentionItem[];
  statuses: Array<{ domain: string; value: string; state: keyof typeof stateCopy }>;
}) {
  return (
    <section aria-labelledby="domain-overview-heading">
      <h2 id="domain-overview-heading" className="sr-only">
        At a glance
      </h2>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {domains.map((domain) => {
          const domainItems = items.filter((item) => item.domain === domain.id);
          const topItem = domainItems[0];
          const status = statuses.find((item) => item.domain === domain.id);
          const effectiveState = domainItems.some((item) => item.severity === "critical" || item.severity === "high")
            ? "critical"
            : domainItems.some((item) => item.severity === "medium" || item.severity === "low")
              ? "warning"
              : status?.state;
          return (
            <Link
              href={domain.href}
              key={domain.id}
              className="panel group flex flex-col p-4 transition hover:-translate-y-0.5 hover:border-[var(--line-bright)] hover:bg-[var(--panel-raised)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: domain.color }} />
                  <h3 className="text-sm font-semibold">{domain.label}</h3>
                </div>
                <span
                  className="rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em]"
                  style={{
                    color: effectiveState ? stateColor[effectiveState] : "var(--muted)",
                    background: effectiveState
                      ? `color-mix(in srgb, ${stateColor[effectiveState]} 12%, transparent)`
                      : "var(--surface-soft)",
                  }}
                >
                  {effectiveState ? stateCopy[effectiveState] : "No active signals"}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-xs text-[var(--muted)]">
                {topItem?.title ?? status?.value ?? "Nothing needs attention"}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
