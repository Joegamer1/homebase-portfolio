import { describe, expect, it } from "vitest";
import { ProxmoxCollector, type ProxmoxCollectorConfig, type ProxmoxTransport } from "./proxmox.js";

const config: ProxmoxCollectorConfig = {
  baseUrl: "https://proxmox.example.test:8006",
  tokenId: "homebase@pve!reader",
  tokenSecret: "not-a-real-secret",
  tlsVerify: true,
  storageWarningPercent: 80,
  cpuWarningPercent: 90,
  memoryWarningPercent: 90,
  expectedDownIds: new Set([102]),
};

class FixtureTransport implements ProxmoxTransport {
  async get(path: string) {
    if (path === "/version") return [{ version: "9.0" }];
    if (path.startsWith("/cluster/tasks"))
      return [{ upid: "task-1", node: "demo", type: "vzdump", status: "backup failed", starttime: 1_700_000_000 }];
    return [
      { id: "node/demo", type: "node", node: "demo", status: "online", uptime: 3600, cpu: 0.25, mem: 50, maxmem: 100 },
      { id: "qemu/101", type: "qemu", vmid: 101, name: "docker", node: "demo", status: "stopped", mem: 0, maxmem: 100 },
      { id: "qemu/102", type: "qemu", vmid: 102, name: "haos", node: "demo", status: "stopped", mem: 0, maxmem: 100 },
      {
        id: "storage/demo/local",
        type: "storage",
        storage: "local",
        node: "demo",
        status: "available",
        disk: 85,
        maxdisk: 100,
      },
    ];
  }
}

describe("ProxmoxCollector", () => {
  it("normalizes resources and creates actionable, deduplicable signals", async () => {
    const snapshot = await new ProxmoxCollector(config, new FixtureTransport()).collect();
    expect(snapshot.nodes[0]).toMatchObject({ name: "demo", cpuUsagePercent: 25 });
    expect(snapshot.storage[0]?.usagePercent).toBe(85);
    expect(snapshot.workloads.find((item) => item.vmid === 102)?.expectedDown).toBe(true);
    expect(snapshot.signals.map((item) => item.id)).toEqual([
      "proxmox-qemu-101-down",
      "proxmox-storage-storage/demo/local-threshold",
      "proxmox-task-task-1",
    ]);
  });

  it("returns down health without leaking credentials when connection fails", async () => {
    const transport: ProxmoxTransport = {
      get: async () => {
        throw new Error("connection refused");
      },
    };
    const health = await new ProxmoxCollector(config, transport).testConnection();
    expect(health).toMatchObject({ state: "down", stale: true, message: "connection refused" });
    expect(JSON.stringify(health)).not.toContain(config.tokenSecret);
  });
});
