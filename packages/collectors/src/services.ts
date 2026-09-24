import { createHash } from "node:crypto";
import type { Collector, CollectorHealth, ServiceRecord, ServiceSnapshot } from "@homebase/domain";

export interface ServiceCollectorConfig {
  source: "docker" | "uptime-kuma";
  baseUrl: string;
  apiKey?: string;
  expectedDownNames?: Set<string>;
  restartWarningCount?: number;
  timeoutMs?: number;
}

// Provider responses never cross the API boundary: inspect contains environment secrets.
export class ServiceCollector implements Collector<ServiceSnapshot> {
  readonly name: string;
  constructor(
    private readonly config: ServiceCollectorConfig,
    private readonly request = fetch,
  ) {
    this.name = config.source;
  }
  private async get(path: string, signal: AbortSignal) {
    const url = new URL(this.config.baseUrl.replace(/\/$/, "") + path);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new Error("Invalid provider URL");
    const headers: Record<string, string> = {};
    if (this.config.apiKey) headers.Authorization = `Basic ${Buffer.from(`:${this.config.apiKey}`).toString("base64")}`;
    const response = await this.request(url, { method: "GET", headers, signal, redirect: "error" });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    return response;
  }
  async collect(): Promise<ServiceSnapshot> {
    const signal = AbortSignal.timeout(this.config.timeoutMs ?? 10000);
    const collectedAt = new Date().toISOString();
    let services: ServiceRecord[];
    if (this.config.source === "docker") {
      const list: unknown = await (await this.get("/containers/json?all=1", signal)).json();
      if (!Array.isArray(list) || list.length > 1000) throw new Error("Invalid container list");
      services = [];
      // Bounded batches avoid flooding the Docker daemon.
      for (let offset = 0; offset < list.length; offset += 8) {
        services.push(
          ...(await Promise.all(
            list.slice(offset, offset + 8).map(async (entry: unknown) => {
              const id = (entry as { Id?: unknown })?.Id;
              if (typeof id !== "string" || !/^[a-f0-9]{12,64}$/.test(id)) throw new Error("Invalid container ID");
              const raw = (await (await this.get(`/containers/${id}/json`, signal)).json()) as {
                Name?: string;
                State?: { Status?: string; StartedAt?: string; Health?: { Status?: string } };
                Config?: { Image?: string };
                RestartCount?: number;
              };
              if (
                typeof raw.Name !== "string" ||
                typeof raw.State?.Status !== "string" ||
                typeof raw.Config?.Image !== "string" ||
                typeof raw.RestartCount !== "number" ||
                !Number.isInteger(raw.RestartCount) ||
                raw.RestartCount < 0
              )
                throw new Error("Invalid container inspection");
              const name = raw.Name.replace(/^\//, "");
              const started = Date.parse(raw.State.StartedAt ?? "");
              return {
                id,
                name,
                state: raw.State.Status,
                health: raw.State.Health?.Status ?? "not-configured",
                image: raw.Config.Image,
                restartCount: raw.RestartCount,
                uptimeSeconds:
                  raw.State.Status === "running" && Number.isFinite(started)
                    ? Math.max(0, Math.floor((Date.now() - started) / 1000))
                    : 0,
                expectedDown: this.config.expectedDownNames?.has(name) ?? false,
              };
            }),
          )),
        );
      }
    } else {
      services = parseKumaMetrics(await (await this.get("/metrics", signal)).text());
    }
    return {
      source: this.config.source,
      collectedAt,
      stale: false,
      services,
      signals: services.flatMap((service) => {
        const failed =
          this.config.source === "docker"
            ? (!service.expectedDown && service.state !== "running") || service.health === "unhealthy"
            : service.state === "down";
        const restarts = (service.restartCount ?? 0) >= (this.config.restartWarningCount ?? 5);
        if (!failed && !restarts) return [];
        const reason = failed
          ? `State: ${service.state}; health: ${service.health}.`
          : `${service.restartCount} restarts since container creation; review restart history.`;
        return [
          {
            id: `${this.name}:${service.id}:${failed ? "unavailable" : "restarts"}`,
            domain: "lab" as const,
            title: `${service.name} ${failed ? "needs attention" : "has repeated restarts"}`,
            summary: reason,
            severity: failed ? ("high" as const) : ("medium" as const),
            source: this.name,
            entity: service.name,
            observedAt: collectedAt,
            urgency: failed ? 85 : 50,
            relevance: 100,
            consequence: 70,
            recency: 100,
            confidence: 95,
            action: { label: "Review service", href: "/lab/services" },
          },
        ];
      }),
    };
  }
  async testConnection(): Promise<CollectorHealth> {
    const checkedAt = new Date().toISOString();
    try {
      await this.collect();
      return { state: "healthy", checkedAt, stale: false, lastSuccessAt: checkedAt };
    } catch {
      return { state: "down", checkedAt, stale: false, message: "Service collection failed" };
    }
  }
}

export function parseKumaMetrics(text: string): ServiceRecord[] {
  const monitors = new Map<string, { labels: Record<string, string>; status?: number; latency?: number }>();
  for (const line of text.split("\n")) {
    if (!/^monitor_(status|response_time)\{/.test(line)) continue;
    const match = line.match(/^monitor_(status|response_time)\{(.*)\}\s+(\S+)(?:\s+\S+)?$/);
    if (!match) throw new Error("Invalid monitor metric");
    const labels: Record<string, string> = {};
    const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"(?:,\s*|$)/g;
    let end = 0;
    for (const label of match[2].matchAll(pattern)) {
      if (label.index !== end) throw new Error("Invalid metric labels");
      labels[label[1]] = label[2].replace(/\\([\\"n])/g, (_, char: string) => (char === "n" ? "\n" : char));
      end = label.index + label[0].length;
    }
    if (end !== match[2].length || !labels.monitor_name) throw new Error("Missing monitor identity");
    // Older Kuma versions omit monitor_id; use the full label set to avoid name collisions.
    const id = labels.monitor_id ?? JSON.stringify(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
    const item = monitors.get(id) ?? { labels };
    const value = Number(match[3]);
    if (match[1] === "status") {
      if (![0, 1, 2, 3].includes(value)) throw new Error("Invalid monitor status");
      item.status = value;
    } else if (Number.isFinite(value) && value >= 0) item.latency = value;
    monitors.set(id, item);
  }
  if (!monitors.size) throw new Error("No monitor metrics available");
  if (![...monitors.values()].some((item) => item.status !== undefined)) throw new Error("No monitor status available");
  return [...monitors]
    .filter(([, item]) => item.status !== undefined)
    .map(([id, item]) => ({
      id: createHash("sha256").update(id).digest("hex"),
      name: item.labels.monitor_name,
      state: ["down", "up", "pending", "maintenance"][item.status!],
      health: ["down", "healthy", "pending", "maintenance"][item.status!],
      latencyMs: item.latency,
      expectedDown: item.status === 3,
    }));
}
