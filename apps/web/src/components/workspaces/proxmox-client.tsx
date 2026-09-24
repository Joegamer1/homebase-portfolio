"use client";

import { useEffect, useState } from "react";
import type { ProxmoxResponse } from "@homebase/api-contracts";
import { ErrorState, LoadingState } from "@/components/ui/data-state";
import { PageHeading } from "@/components/ui/page-heading";
import { fetchProxmox } from "@/lib/api-client";

const bytes = (value: number) => `${(value / 1024 ** 3).toFixed(1)} GiB`;
const uptime = (seconds: number) => `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;

export function ProxmoxClient() {
  const [data, setData] = useState<ProxmoxResponse["data"]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    fetchProxmox(controller.signal)
      .then((response) => setData(response.data))
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Proxmox data unavailable");
      });
    return () => controller.abort();
  }, []);
  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;
  return (
    <div>
      <PageHeading
        eyebrow="Workspace / Lab / Proxmox"
        title="Proxmox infrastructure"
        description="Read-only node, guest, storage, and task state from the HOMEBASE API."
      />
      <div className="panel mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 p-4 text-[10px]">
        <span className="mono">
          STATE <b>{data.health.state.toUpperCase()}</b>
        </span>

        {data.health.stale && <span className="mono text-[var(--amber)]">STALE · LAST KNOWN DATA</span>}
      </div>
      {!data.configured && (
        <section className="panel p-5 text-sm">
          Proxmox is disabled until server-side token variables are configured.
        </section>
      )}
      {data.configured && !data.snapshot && (
        <section className="panel p-5 text-sm text-[var(--red)]">
          No successful Proxmox snapshot is available. {data.health.lastError}
        </section>
      )}
      {data.snapshot && <Snapshot data={data.snapshot} />}
    </div>
  );
}

function Snapshot({ data }: { data: NonNullable<ProxmoxResponse["data"]["snapshot"]> }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.nodes.map((node) => (
          <section key={node.id} className="panel p-4">
            <div className="section-label">NODE · {node.name}</div>
            <div
              className={`mono mt-4 text-lg ${node.status === "online" ? "text-[var(--green)]" : "text-[var(--red)]"}`}
            >
              {node.status.toUpperCase()}
            </div>
            <div className="mono mt-3 text-[9px] text-[var(--muted)]">
              CPU {node.cpuUsagePercent.toFixed(1)}% · RAM {bytes(node.memoryUsedBytes)} /{" "}
              {bytes(node.memoryTotalBytes)} · UP {uptime(node.uptimeSeconds)}
            </div>
          </section>
        ))}
      </div>
      <Table
        title="Virtual machines and containers"
        headers={["Guest", "Type", "Node", "State", "CPU", "Memory"]}
        rows={data.workloads.map((guest) => [
          `${guest.vmid} · ${guest.name}`,
          guest.kind.toUpperCase(),
          guest.node,
          guest.status.toUpperCase(),
          `${guest.cpuUsagePercent.toFixed(1)}%`,
          `${bytes(guest.memoryUsedBytes)} / ${bytes(guest.memoryTotalBytes)}`,
        ])}
      />
      <Table
        title="Storage"
        headers={["Pool", "Node", "State", "Used", "Capacity", "Usage"]}
        rows={data.storage.map((item) => [
          item.name,
          item.node ?? "cluster",
          item.status.toUpperCase(),
          bytes(item.usedBytes),
          bytes(item.totalBytes),
          `${item.usagePercent.toFixed(1)}%`,
        ])}
      />
      <Table
        title="Recent failed tasks"
        headers={["Task", "Node", "Status", "Started"]}
        rows={data.failedTasks.map((task) => [task.type, task.node, task.status, task.startedAt])}
        empty="No recent failed tasks."
      />
    </div>
  );
}

function Table({
  title,
  headers,
  rows,
  empty = "No records.",
}: {
  title: string;
  headers: string[];
  rows: string[][];
  empty?: string;
}) {
  return (
    <section className="panel overflow-x-auto">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="section-label text-[var(--text)]">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="p-4 text-[11px] text-[var(--muted)]">{empty}</div>
      ) : (
        <table className="w-full min-w-[680px] text-left text-[10px]">
          <thead className="border-b border-[var(--line)] text-[var(--faint)]">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-[var(--line)]">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
