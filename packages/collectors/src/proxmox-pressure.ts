import type { ProxmoxSnapshot, RawAttentionSignal } from "@homebase/domain";

export interface PressureState {
  checkedAt: string;
  metrics: Record<string, { since: string; active: boolean }>;
}

/** Three continuous minutes above threshold; five percentage points of recovery hysteresis. */
export function evaluateProxmoxPressure(
  snapshot: ProxmoxSnapshot,
  thresholds: { cpuWarningPercent: number; memoryWarningPercent: number },
  previous?: PressureState,
): { state: PressureState; signals: RawAttentionSignal[] } {
  const now = Date.parse(snapshot.collectedAt);
  const elapsed = previous ? now - Date.parse(previous.checkedAt) : Infinity;
  const continuous = elapsed >= 0 && elapsed <= 150_000;
  const state: PressureState = { checkedAt: snapshot.collectedAt, metrics: {} };
  const signals: RawAttentionSignal[] = [];
  const resources = [
    ...snapshot.nodes.filter((node) => node.status === "online"),
    ...snapshot.workloads.filter((guest) => guest.status === "running"),
  ];
  for (const resource of resources) {
    const metrics = [
      { name: "CPU", value: resource.cpuUsagePercent, threshold: thresholds.cpuWarningPercent },
      ...(resource.memoryTotalBytes > 0
        ? [
            {
              name: "memory",
              value: (resource.memoryUsedBytes / resource.memoryTotalBytes) * 100,
              threshold: thresholds.memoryWarningPercent,
            },
          ]
        : []),
    ];
    for (const metric of metrics) {
      const id = `proxmox-pressure-${resource.id}-${metric.name.toLowerCase()}`;
      const old = continuous ? previous?.metrics[id] : undefined;
      if (metric.value < (old?.active ? metric.threshold - 5 : metric.threshold)) continue;
      const since = old?.since ?? snapshot.collectedAt;
      const active = Boolean(old?.active) || now - Date.parse(since) >= 180_000;
      state.metrics[id] = { since, active };
      if (!active) continue;
      signals.push({
        id,
        domain: "lab",
        source: "Proxmox",
        entity: resource.name,
        title: `${resource.name} has sustained high ${metric.name} usage`,
        summary: `${metric.name} is ${metric.value.toFixed(1)}%; warning threshold ${metric.threshold}%. Elevated since ${since}. Clears below ${metric.threshold - 5}%.`,
        severity: "high",
        urgency: 75,
        relevance: 100,
        consequence: 80,
        recency: 100,
        confidence: 95,
        observedAt: since,
        action: { label: "Inspect resource", href: "/lab/proxmox" },
      });
    }
  }
  return { state, signals };
}
