"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ServiceResponse } from "@homebase/api-contracts";
import { PageHeading } from "@/components/ui/page-heading";
import { fetchServices } from "@/lib/api-client";

export function ServicesClient() {
  return (
    <div>
      <PageHeading
        eyebrow="Workspace / Lab"
        title="Containers & service health"
        description="Container state and availability checks, with the last successful observation retained during outages."
      />
      <Link href="/lab/proxmox" className="text-sm underline">
        Proxmox infrastructure →
      </Link>
      <div className="mt-4 space-y-4">
        <ServicePanel source="docker" title="Docker containers" />
        <ServicePanel source="uptime-kuma" title="Uptime Kuma monitors" />
      </div>
    </div>
  );
}
function ServicePanel({ source, title }: { source: "docker" | "uptime-kuma"; title: string }) {
  const [data, setData] = useState<ServiceResponse["data"]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetchServices(source, controller.signal);
        if (!controller.signal.aborted) {
          setData(response.data);
          setError(undefined);
        }
      } catch {
        if (!controller.signal.aborted) setError("Refresh failed. Any displayed data is last known and may be stale.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 30000);
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [source]);
  return (
    <section className="panel overflow-x-auto p-4">
      <h2 className="section-label">{title}</h2>
      {error && (
        <p role="alert" className="my-3 text-sm text-[var(--amber)]">
          {error}
        </p>
      )}
      {!data && !error && (
        <p role="status" className="my-3 text-sm">
          Loading…
        </p>
      )}
      {data && (
        <>
          {data.health.stale && (
            <p role="status" className="my-3 text-xs text-[var(--amber)]">
              Showing last known data.
            </p>
          )}
          <details className="my-3 text-xs text-[var(--muted)]">
            <summary className="cursor-pointer">Connection details</summary>{" "}
            <p className="mono my-3 text-[10px]">
              COLLECTOR {data.health.state.toUpperCase()} ·{" "}
              {data.health.stale || error ? "STALE · LAST KNOWN DATA" : "FRESH"} · LAST SUCCESS{" "}
              {data.health.lastSuccessAt ? new Date(data.health.lastSuccessAt).toLocaleString() : "—"}
            </p>
          </details>
          {!data.configured && <p className="text-sm text-[var(--muted)]">Not connected yet.</p>}
          {data.configured && !data.snapshot && (
            <p className="text-sm text-[var(--amber)]">No successful observation available. {data.health.message}</p>
          )}
          {data.snapshot && (
            <>
              <table className="w-full min-w-[700px] text-left text-[11px]">
                <thead>
                  <tr>
                    {[
                      "Service",
                      "State",
                      "Health",
                      ...(source === "docker" ? ["Uptime", "Restarts", "Image"] : ["Latency"]),
                    ].map((label) => (
                      <th key={label} className="border-b border-[var(--line)] p-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.snapshot.services.map((service) => (
                    <tr key={service.id} className="border-b border-[var(--line)]">
                      <td className="p-2">
                        {service.name}
                        {service.expectedDown && <span className="text-[var(--muted)]"> · expected / maintenance</span>}
                      </td>
                      <td className="p-2">{service.state}</td>
                      <td className="p-2">{service.health}</td>
                      {source === "docker" ? (
                        <>
                          <td className="p-2">{Math.floor((service.uptimeSeconds ?? 0) / 3600)}h</td>
                          <td className="p-2">{service.restartCount ?? "—"}</td>
                          <td className="p-2">{service.image}</td>
                        </>
                      ) : (
                        <td className="p-2">{service.latencyMs === undefined ? "—" : `${service.latencyMs} ms`}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.snapshot.services.length === 0 && <p className="my-3 text-sm">No containers found.</p>}
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
    </section>
  );
}
