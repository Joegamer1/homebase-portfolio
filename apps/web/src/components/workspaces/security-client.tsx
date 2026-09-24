"use client";

import { useEffect, useState } from "react";
import type { SecurityResponse } from "@homebase/api-contracts";
import { PageHeading } from "@/components/ui/page-heading";
import { fetchSecurity } from "@/lib/api-client";

type Advisory = NonNullable<SecurityResponse["data"]["snapshot"]>["advisories"][number];
type SecurityView = "action" | "kev" | "lab" | "career" | "all";

const severityColor = {
  info: "var(--cyan)",
  low: "var(--green)",
  medium: "var(--amber)",
  high: "var(--red)",
  critical: "var(--red)",
};
const categoryLabel = {
  "affects-lab": "Matches your lab",
  "career-relevant": "Career-relevant",
  "general-high-signal": "General signal",
};
const dateLabel = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
    : "Date unavailable";

function matchesView(advisory: Advisory, view: SecurityView) {
  if (view === "action")
    return (
      advisory.classification === "affects-lab" &&
      (advisory.knownExploited || advisory.severity === "critical" || advisory.severity === "high")
    );
  if (view === "kev") return advisory.knownExploited;
  if (view === "lab") return advisory.classification === "affects-lab";
  if (view === "career") return advisory.classification === "career-relevant";
  return true;
}

export function SecurityClient() {
  const [data, setData] = useState<SecurityResponse["data"]>();
  const [error, setError] = useState<string>();
  const [view, setView] = useState<SecurityView>("action");

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        setData((await fetchSecurity(controller.signal)).data);
        setError(undefined);
      } catch {
        if (!controller.signal.aborted) setError("Security refresh failed. Displayed values may be stale.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 300000);
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const snapshot = data?.snapshot;
  const advisories = snapshot?.advisories ?? [];
  const counts = {
    action: advisories.filter((item) => matchesView(item, "action")).length,
    kev: advisories.filter((item) => item.knownExploited).length,
    lab: advisories.filter((item) => item.classification === "affects-lab").length,
    career: advisories.filter((item) => item.classification === "career-relevant").length,
    all: advisories.length,
  };
  const visible = advisories.filter((item) => matchesView(item, view));
  const tabs: Array<{ id: SecurityView; label: string; note: string }> = [
    { id: "action", label: "Act first", note: "Urgent lab matches" },
    { id: "kev", label: "Known exploited", note: "CISA KEV" },
    { id: "lab", label: "My lab", note: "Technology matches" },
    { id: "career", label: "Career", note: "Learning relevance" },
    { id: "all", label: "Everything", note: "Full ranked list" },
  ];

  return (
    <div>
      <PageHeading
        eyebrow="Workspace / Security"
        title="Security intelligence"
        description="Prioritized vulnerability signals matched against the technology running in HOMEBASE."
      />
      {error && (
        <p className="mb-4 rounded-lg bg-[color-mix(in_srgb,var(--amber)_12%,var(--panel))] p-3 text-sm text-[var(--amber)]">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-sm text-[var(--muted)]">Loading authoritative feeds…</p>}
      {data?.health.stale && (
        <p role="status" className="mb-3 text-xs text-[var(--amber)]">
          Security feeds may be out of date.
        </p>
      )}
      {data && (
        <>
          <details className="panel mb-5 p-5">
            <summary className="cursor-pointer text-sm">Feed details</summary>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${data.health.state === "healthy" ? "bg-[var(--green)]" : "bg-[var(--amber)]"}`}
                  />
                  <span className="text-sm font-medium">
                    {data.health.state === "healthy" ? "Feeds are current" : "Using last-known security data"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Last successful refresh{" "}
                  {data.health.lastSuccessAt ? new Date(data.health.lastSuccessAt).toLocaleString() : "unavailable"}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Act first", counts.action, "var(--red)"],
                  ["Lab matches", counts.lab, "var(--amber)"],
                  ["Total", counts.all, "var(--cyan)"],
                ].map(([label, count, color]) => (
                  <div key={label} className="soft-card min-w-20 p-3">
                    <div className="section-label">{label}</div>
                    <div className="mono mt-2 text-xl" style={{ color: String(color) }}>
                      {count}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {!snapshot && (
              <p className="mt-4 text-sm text-[var(--amber)]">No successful collection is available yet.</p>
            )}
          </details>

          {snapshot && (
            <>
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Security advisory filters">
                {tabs.map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => setView(tab.id)}
                    data-active={view === tab.id}
                    aria-pressed={view === tab.id}
                    className="filter-tab min-w-32 shrink-0"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-semibold">{tab.label}</span>
                      <span className="mono text-sm">{counts[tab.id]}</span>
                    </span>
                    <span className="mt-1 block text-[10px] text-[var(--faint)]">{tab.note}</span>
                  </button>
                ))}
              </div>

              <section className="panel overflow-hidden" aria-labelledby="advisory-heading">
                <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                  <div>
                    <div className="section-label">Selected view</div>
                    <h2 id="advisory-heading" className="mt-1 text-sm font-semibold">
                      {tabs.find((tab) => tab.id === view)?.label}
                    </h2>
                  </div>
                  <span className="text-xs text-[var(--muted)]">
                    {visible.length} advisories · ranked by consequence
                  </span>
                </div>
                {!visible.length && <p className="p-5 text-sm text-[var(--muted)]">No advisories match this view.</p>}
                {visible.map((advisory) => (
                  <details className="group border-b border-[var(--line)] last:border-0" key={advisory.id}>
                    <summary className="cursor-pointer list-none px-4 py-4 hover:bg-[var(--panel-raised)]">
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: severityColor[advisory.severity] }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="mono text-[10px] font-semibold text-[var(--cyan)]">{advisory.cveId}</span>
                            {advisory.knownExploited && (
                              <span className="rounded-full bg-[color-mix(in_srgb,var(--red)_15%,transparent)] px-2 py-0.5 text-[9px] font-semibold text-[var(--red)]">
                                KNOWN EXPLOITED
                              </span>
                            )}
                            <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[9px] text-[var(--muted)]">
                              {categoryLabel[advisory.classification]}
                            </span>
                          </div>
                          <h3 className="mt-1.5 text-sm font-medium">{advisory.title}</h3>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{advisory.summary}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <div
                            className="mono text-[10px] font-semibold"
                            style={{ color: severityColor[advisory.severity] }}
                          >
                            {advisory.severity.toUpperCase()}
                            {advisory.cvssScore === undefined ? "" : ` · ${advisory.cvssScore}`}
                          </div>
                          <time className="mt-1 block text-[10px] text-[var(--faint)]" dateTime={advisory.publishedAt}>
                            {dateLabel(advisory.publishedAt)}
                          </time>
                        </div>
                      </div>
                    </summary>
                    <div className="bg-[var(--surface-soft)] px-4 py-4 sm:pl-9">
                      <p className="max-w-4xl text-xs leading-5 text-[var(--muted)]">{advisory.summary}</p>
                      {advisory.matches.map((match) => (
                        <div
                          className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-xs"
                          key={match.technologyId}
                        >
                          <div className="font-medium text-[var(--amber)]">Matched: {match.product}</div>
                          <p className="mt-1 leading-5 text-[var(--muted)]">{match.explanation}</p>
                        </div>
                      ))}
                      {advisory.requiredAction && (
                        <div className="mt-3 rounded-lg bg-[color-mix(in_srgb,var(--red)_10%,var(--panel))] p-3 text-xs">
                          <b>Recommended action:</b> {advisory.requiredAction}
                        </div>
                      )}
                      <a
                        className="mt-4 inline-flex rounded-lg border border-[var(--line-bright)] bg-[var(--panel-raised)] px-3 py-2 text-xs font-medium text-[var(--cyan)]"
                        href={advisory.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open authoritative source ↗
                      </a>
                    </div>
                  </details>
                ))}
              </section>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <details className="panel p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Source health{" "}
                    <span className="ml-2 text-xs text-[var(--muted)]">{snapshot.feeds.length} feeds</span>
                  </summary>
                  <div className="mt-3 border-t border-[var(--line)] pt-2">
                    {snapshot.feeds.map((feed) => (
                      <div className="flex justify-between gap-4 py-2 text-xs" key={feed.source}>
                        <span>{feed.source === "cisa-kev" ? "CISA KEV" : "NVD CVE 2.0"}</span>
                        <span className="text-right text-[var(--muted)]">
                          {feed.state} · {feed.itemCount} records{feed.stale ? " · last known" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
                <details className="panel p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Tracked technology{" "}
                    <span className="ml-2 text-xs text-[var(--muted)]">{snapshot.technologies.length} products</span>
                  </summary>
                  <div className="mt-3 max-h-64 overflow-auto border-t border-[var(--line)] pt-2">
                    {snapshot.technologies.map((technology) => (
                      <div className="flex justify-between gap-4 py-2 text-xs" key={technology.id}>
                        <span>{technology.product}</span>
                        <span className="mono text-right text-[var(--muted)]">
                          {technology.version ?? "version unknown"} · {technology.confidence}%
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
