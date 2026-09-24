import { request as httpRequest } from "node:http";
import { Agent, request as httpsRequest } from "node:https";
import type {
  Collector,
  CollectorHealth,
  ProxmoxFailedTask,
  ProxmoxNode,
  ProxmoxSnapshot,
  ProxmoxStorage,
  ProxmoxWorkload,
  RawAttentionSignal,
  Severity,
} from "@homebase/domain";

export interface ProxmoxCollectorConfig {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  tlsVerify: boolean;
  storageWarningPercent: number;
  cpuWarningPercent: number;
  memoryWarningPercent: number;
  expectedDownIds: Set<number>;
}

export interface ProxmoxTransport {
  get(path: string): Promise<unknown[]>;
}

type Raw = Record<string, unknown>;
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const string = (value: unknown, fallback = "unknown") => (typeof value === "string" && value ? value : fallback);
const percent = (ratio: unknown) => Math.min(100, Math.max(0, number(ratio) * 100));
const epoch = (value: unknown) => new Date(number(value) * 1000).toISOString();

export class HttpProxmoxTransport implements ProxmoxTransport {
  constructor(private readonly config: ProxmoxCollectorConfig) {}

  get(path: string): Promise<unknown[]> {
    const url = new URL(`/api2/json${path}`, this.config.baseUrl);
    const sender = url.protocol === "https:" ? httpsRequest : httpRequest;
    const agent = url.protocol === "https:" ? new Agent({ rejectUnauthorized: this.config.tlsVerify }) : undefined;
    return new Promise((resolve, reject) => {
      const request = sender(
        url,
        {
          method: "GET",
          headers: { Authorization: `PVEAPIToken=${this.config.tokenId}=${this.config.tokenSecret}` },
          agent,
          timeout: 10_000,
        },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => {
            if ((response.statusCode ?? 500) >= 400)
              return reject(new Error(`Proxmox returned HTTP ${response.statusCode}`));
            try {
              const parsed = JSON.parse(body) as { data?: unknown };
              resolve(Array.isArray(parsed.data) ? parsed.data : parsed.data == null ? [] : [parsed.data]);
            } catch {
              reject(new Error("Proxmox returned invalid JSON"));
            }
          });
        },
      );
      request.on("timeout", () => request.destroy(new Error("Proxmox request timed out")));
      request.on("error", reject);
      request.end();
    });
  }
}

const signal = (
  id: string,
  title: string,
  summary: string,
  severity: Severity,
  entity: string,
  observedAt: string,
  dimensions: Pick<RawAttentionSignal, "urgency" | "relevance" | "consequence" | "recency" | "confidence">,
): RawAttentionSignal => ({
  id,
  domain: "lab",
  title,
  summary,
  severity,
  source: "Proxmox",
  entity,
  observedAt,
  action: { label: "Open Proxmox", href: "/lab/proxmox" },
  ...dimensions,
});

export class ProxmoxCollector implements Collector<ProxmoxSnapshot> {
  readonly name = "proxmox";
  private readonly transport: ProxmoxTransport;

  constructor(
    private readonly config: ProxmoxCollectorConfig,
    transport?: ProxmoxTransport,
  ) {
    this.transport = transport ?? new HttpProxmoxTransport(config);
  }

  async testConnection(): Promise<CollectorHealth> {
    const started = Date.now();
    const checkedAt = new Date().toISOString();
    try {
      await this.transport.get("/version");
      return {
        state: "healthy",
        checkedAt,
        lastAttemptAt: checkedAt,
        lastSuccessAt: checkedAt,
        latencyMs: Date.now() - started,
        stale: false,
        message: "Proxmox API connection succeeded",
      };
    } catch (error) {
      return {
        state: "down",
        checkedAt,
        lastAttemptAt: checkedAt,
        lastError: error instanceof Error ? error.message : "Proxmox connection failed",
        latencyMs: Date.now() - started,
        stale: true,
        message: error instanceof Error ? error.message : "Proxmox connection failed",
      };
    }
  }

  async collect(): Promise<ProxmoxSnapshot> {
    const collectedAt = new Date().toISOString();
    const [resources, tasks] = await Promise.all([
      this.transport.get("/cluster/resources"),
      this.transport.get("/cluster/tasks"),
    ]);
    const rows = resources as Raw[];
    const nodes = rows.filter((row) => row.type === "node").map((row) => this.normalizeNode(row));
    const workloads = rows
      .filter((row) => row.type === "qemu" || row.type === "lxc")
      .map((row) => this.normalizeWorkload(row));
    const storage = rows.filter((row) => row.type === "storage").map((row) => this.normalizeStorage(row));
    const failedTasks = (tasks as Raw[])
      .filter((row) => typeof row.status === "string" && row.status !== "OK" && row.status !== "running")
      .slice(0, 50)
      .map((row) => this.normalizeTask(row));
    return {
      source: "proxmox",
      collectedAt,
      stale: false,
      nodes,
      workloads,
      storage,
      failedTasks,
      signals: this.buildSignals(nodes, workloads, storage, failedTasks, collectedAt),
    };
  }

  private normalizeNode(row: Raw): ProxmoxNode {
    return {
      id: string(row.id, `node/${string(row.node)}`),
      name: string(row.node),
      status: row.status === "online" ? "online" : row.status === "offline" ? "offline" : "unknown",
      uptimeSeconds: number(row.uptime),
      cpuUsagePercent: percent(row.cpu),
      memoryUsedBytes: number(row.mem),
      memoryTotalBytes: number(row.maxmem),
    };
  }

  private normalizeWorkload(row: Raw): ProxmoxWorkload {
    const vmid = number(row.vmid);
    return {
      id: string(row.id, `${string(row.type)}/${vmid}`),
      vmid,
      name: string(row.name, `Guest ${vmid}`),
      kind: row.type === "lxc" ? "lxc" : "qemu",
      node: string(row.node),
      status: string(row.status),
      uptimeSeconds: number(row.uptime),
      cpuUsagePercent: percent(row.cpu),
      memoryUsedBytes: number(row.mem),
      memoryTotalBytes: number(row.maxmem),
      expectedDown: this.config.expectedDownIds.has(vmid),
    };
  }

  private normalizeStorage(row: Raw): ProxmoxStorage {
    const total = number(row.maxdisk);
    const used = number(row.disk);
    return {
      id: string(row.id, `storage/${string(row.storage)}`),
      name: string(row.storage),
      node: typeof row.node === "string" ? row.node : undefined,
      status: string(row.status),
      usedBytes: used,
      totalBytes: total,
      usagePercent: total > 0 ? Math.min(100, (used / total) * 100) : 0,
    };
  }

  private normalizeTask(row: Raw): ProxmoxFailedTask {
    return {
      id: string(row.upid, `${string(row.node)}-${number(row.starttime)}`),
      node: string(row.node),
      type: string(row.type),
      status: string(row.status),
      user: typeof row.user === "string" ? row.user : undefined,
      startedAt: epoch(row.starttime),
      endedAt: number(row.endtime) > 0 ? epoch(row.endtime) : undefined,
    };
  }

  private buildSignals(
    nodes: ProxmoxNode[],
    workloads: ProxmoxWorkload[],
    storage: ProxmoxStorage[],
    failedTasks: ProxmoxFailedTask[],
    observedAt: string,
  ): RawAttentionSignal[] {
    const signals: RawAttentionSignal[] = [];
    for (const node of nodes.filter((item) => item.status !== "online"))
      signals.push(
        signal(
          `proxmox-node-${node.name}-down`,
          `Proxmox node ${node.name} is down`,
          "The node is not reporting online status.",
          "critical",
          node.name,
          observedAt,
          { urgency: 100, relevance: 100, consequence: 100, recency: 100, confidence: 98 },
        ),
      );
    for (const guest of workloads.filter((item) => item.status !== "running" && !item.expectedDown))
      signals.push(
        signal(
          `proxmox-${guest.kind}-${guest.vmid}-down`,
          `${guest.name} is unexpectedly ${guest.status}`,
          `Guest ${guest.vmid} on ${guest.node} is not running and is not marked as expected down.`,
          "high",
          guest.name,
          observedAt,
          { urgency: 88, relevance: 100, consequence: 82, recency: 100, confidence: 98 },
        ),
      );
    for (const item of storage.filter((value) => value.usagePercent >= this.config.storageWarningPercent))
      signals.push(
        signal(
          `proxmox-storage-${item.id}-threshold`,
          `${item.name} storage crossed ${this.config.storageWarningPercent}%`,
          `${item.usagePercent.toFixed(1)}% of the storage pool is used.`,
          item.usagePercent >= 95 ? "critical" : "high",
          item.name,
          observedAt,
          { urgency: Math.min(100, item.usagePercent), relevance: 100, consequence: 86, recency: 100, confidence: 99 },
        ),
      );
    for (const task of failedTasks)
      signals.push(
        signal(
          `proxmox-task-${task.id}`,
          `Proxmox ${task.type} task failed`,
          `${task.status} on ${task.node}.`,
          "high",
          task.node,
          task.endedAt ?? task.startedAt,
          { urgency: 84, relevance: 96, consequence: 76, recency: 95, confidence: 99 },
        ),
      );
    return signals;
  }
}
