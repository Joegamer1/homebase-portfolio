"use client";

import { useEffect, useState } from "react";
import type { HomeSystemResponse } from "@homebase/api-contracts";
import { PageHeading } from "@/components/ui/page-heading";
import { fetchHomeSystem } from "@/lib/api-client";

type HomeSystemSource = "pihole" | "plex" | "home-assistant" | "tailscale";

const sources: Array<{ source: HomeSystemSource; title: string; description: string }> = [
  { source: "pihole", title: "Pi-hole", description: "DNS blocking, query volume, and client activity" },
  { source: "plex", title: "Plex", description: "Server version, libraries, active streams, and transcodes" },
  {
    source: "home-assistant",
    title: "Home Assistant",
    description: "Instance state, unavailable entities, automations, and updates",
  },
  { source: "tailscale", title: "Tailscale", description: "Tailnet state and peer reachability" },
];

export function HomeSystemsClient() {
  return (
    <div>
      <PageHeading
        eyebrow="Workspace / Lab"
        title="Core home systems"
        description="Read-only operational summaries from the services that keep the lab and home running."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {sources.map((item) => (
          <SystemPanel key={item.source} {...item} />
        ))}
      </div>
    </div>
  );
}

function SystemPanel({ source, title, description }: (typeof sources)[number]) {
  const [data, setData] = useState<HomeSystemResponse["data"]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetchHomeSystem(source, controller.signal);
        if (!controller.signal.aborted) {
          setData(response.data);
          setError(undefined);
        }
      } catch {
        if (!controller.signal.aborted) setError("Refresh failed. Displayed values may be stale.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 60000);
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [source]);

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[var(--line)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="section-label text-[var(--text)]">{title}</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{description}</p>
          </div>
          <span className="mono text-[9px] text-[var(--muted)]">{data?.snapshot?.version ?? "—"}</span>
        </div>
      </div>
      <div className="p-4">
        {error && <p className="text-sm text-[var(--amber)]">{error}</p>}
        {!data && !error && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {data && (
          <>
            {data.health.stale && (
              <p role="status" className="my-3 text-xs text-[var(--amber)]">
                Showing last known data.
              </p>
            )}
            <details className="my-3 text-xs text-[var(--muted)]">
              <summary className="cursor-pointer">Connection details</summary>{" "}
              <div className="mono mb-4 text-[9px] uppercase text-[var(--muted)]">
                {data.health.state} · {data.health.stale || error ? "stale / last known" : "fresh"} · last success{" "}
                {data.health.lastSuccessAt ? new Date(data.health.lastSuccessAt).toLocaleString() : "—"}
              </div>
            </details>
            {!data.configured && <p className="text-sm text-[var(--muted)]">Not connected yet.</p>}
            {data.configured && !data.snapshot && (
              <p className="text-sm text-[var(--amber)]">No successful observation available. {data.health.message}</p>
            )}
            {data.snapshot && (
              <>
                <div className="grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3">
                  {data.snapshot.metrics.map((item) => (
                    <div key={item.key} className="bg-[var(--panel)] p-3">
                      <div className="section-label">{item.label}</div>
                      <div className="mono mt-2 text-sm">{item.value}</div>
                    </div>
                  ))}
                </div>
                {data.snapshot.entities.length > 0 && (
                  <div className="mt-4 max-h-52 overflow-auto border border-[var(--line)]">
                    {data.snapshot.entities.map((entity) => (
                      <div
                        key={entity.id}
                        className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2 text-[10px] last:border-0"
                      >
                        <div>
                          <span>{entity.name}</span>
                          {entity.detail && <span className="ml-2 text-[var(--muted)]">{entity.detail}</span>}
                        </div>
                        <span className="mono text-[var(--muted)]">{entity.state}</span>
                      </div>
                    ))}
                  </div>
                )}
                {data.snapshot.signals.map((item) => (
                  <div key={item.id} className="mt-3 border-l-2 border-[var(--amber)] pl-3 text-sm">
                    <b>{item.title}</b>
                    <p>{item.summary}</p>
                    <p className="text-[var(--muted)]">{item.explanation}</p>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
