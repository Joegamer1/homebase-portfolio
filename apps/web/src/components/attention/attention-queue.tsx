"use client";

import { useState } from "react";
import Link from "next/link";
import type { AttentionItem } from "@homebase/api-contracts";

const domainColors = {
  lab: "var(--cyan)",
  security: "var(--red)",
  career: "var(--violet)",
  games: "var(--amber)",
  family: "var(--green)",
  system: "var(--muted)",
};
const severityColors = {
  info: "var(--cyan)",
  low: "var(--green)",
  medium: "var(--amber)",
  high: "var(--red)",
  critical: "var(--red)",
};
const severityLabels = { info: "Info", low: "Low", medium: "Review", high: "High", critical: "Critical" };
type QueueView = "urgent" | "review" | "all";

export function AttentionQueue({ items }: { items: AttentionItem[] }) {
  const urgent = items.filter((item) => item.severity === "critical" || item.severity === "high");
  const review = items.filter((item) => item.severity === "medium" || item.severity === "low");
  const [view, setView] = useState<QueueView>(urgent.length ? "urgent" : "all");
  const visible = view === "urgent" ? urgent : view === "review" ? review : items;
  const tabs: Array<{ id: QueueView; label: string; count: number; note: string }> = [
    { id: "urgent", label: "Act first", count: urgent.length, note: "High + critical" },
    { id: "review", label: "Review", count: review.length, note: "Medium + low" },
    { id: "all", label: "Everything", count: items.length, note: "Full ranked queue" },
  ];

  if (!items.length)
    return (
      <section className="panel p-6">
        <div className="section-label text-[var(--green)]">Attention queue clear</div>
        <p className="mt-3 text-sm text-[var(--muted)]">Nothing currently needs action.</p>
      </section>
    );

  return (
    <section aria-labelledby="attention-heading">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="attention-heading" className="mt-1 text-lg font-semibold">
            Needs attention
          </h2>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2" aria-label="Attention filters">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setView(tab.id)}
            className="filter-tab min-w-0"
            data-active={view === tab.id}
            aria-pressed={view === tab.id}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold">{tab.label}</span>
              <span className="mono text-sm">{tab.count}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="panel overflow-hidden">
        {!visible.length && <p className="p-5 text-sm text-[var(--muted)]">Nothing is waiting in this group.</p>}
        {visible.map((item) => (
          <details key={item.id} className="attention-row group border-b border-[var(--line)] last:border-0">
            <summary className="cursor-pointer list-none px-4 py-4 hover:bg-[var(--panel-raised)]">
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: severityColors[item.severity] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{item.title}</span>
                    <span
                      className="mono text-[9px] font-bold uppercase tracking-[0.08em]"
                      style={{ color: domainColors[item.domain] }}
                    >
                      {item.domain}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{item.summary}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="mono text-[9px]" style={{ color: severityColors[item.severity] }}>
                    {severityLabels[item.severity]}
                  </div>
                </div>
              </div>
            </summary>
            <div className="bg-[var(--surface-soft)] px-4 py-4 pl-12">
              <div className="grid gap-4 text-xs sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="section-label">Why this is ranked</div>
                  <p className="mt-2 leading-5 text-[var(--muted)]">{item.explanation}</p>
                </div>
                <div className="sm:text-right">
                  <div className="section-label">Priority score</div>
                  <div className="mono mt-2 text-xl">{item.score.toFixed(1)}</div>
                </div>
              </div>
              {item.action && (
                <Link
                  className="mt-4 inline-flex rounded-lg border border-[var(--line-bright)] bg-[var(--panel-raised)] px-3 py-2 text-xs font-medium text-[var(--cyan)]"
                  href={item.action.href}
                >
                  {item.action.label} →
                </Link>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
