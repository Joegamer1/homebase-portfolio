import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const snapshot = {
    source: "docker",
    collectedAt: "2026-09-08T12:00:00.000Z",
    stale: false,
    services: [],
    signals: [],
  };
  return {
    snapshot,
    collect: vi.fn(),
    prisma: {
      integration: { upsert: vi.fn().mockResolvedValue({ id: "integration" }) },
      collectorRun: { create: vi.fn().mockResolvedValue({ id: "run" }), update: vi.fn() },
      integrationSnapshot: { upsert: vi.fn(), findUnique: vi.fn() },
      integrationHealth: { upsert: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    },
  };
});
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      return mocks.prisma;
    }
  },
  IntegrationState: { HEALTHY: "HEALTHY", DEGRADED: "DEGRADED", DOWN: "DOWN" },
}));
vi.mock("@homebase/collectors", () => ({
  ServiceCollector: class {
    collect = mocks.collect;
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("service persistence and refresh", () => {
  it("deduplicates requests, retains stale data on failure, and recovers", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv("DOCKER_PROXY_URL", "http://proxy");
    vi.stubEnv("SERVICE_REFRESH_SECONDS", "60");
    mocks.collect.mockResolvedValue(mocks.snapshot);
    const { getService } = await import("./services.js");
    const results = await Promise.all([getService("docker"), getService("docker")]);
    expect(mocks.collect).toHaveBeenCalledTimes(1);
    expect(results[0].data.health.state).toBe("healthy");
    expect(mocks.prisma.integrationSnapshot.upsert).toHaveBeenCalled();
    vi.advanceTimersByTime(61000);
    mocks.collect.mockRejectedValue(new Error("secret raw failure"));
    mocks.prisma.integrationSnapshot.findUnique.mockResolvedValue({ payload: mocks.snapshot });
    mocks.prisma.integrationHealth.findUnique.mockResolvedValue({
      lastSuccessAt: new Date(mocks.snapshot.collectedAt),
    });
    const stale = await getService("docker");
    expect(stale.data.health.state).toBe("degraded");
    expect(stale.data.snapshot?.stale).toBe(true);
    expect(stale.data.health.lastSuccessAt).toBe(mocks.snapshot.collectedAt);
    expect(JSON.stringify(stale)).not.toContain("secret");
    await getService("docker");
    expect(mocks.collect).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(61000);
    mocks.collect.mockResolvedValue(mocks.snapshot);
    expect((await getService("docker")).data.health.state).toBe("healthy");
  });
  it("returns disabled without accessing persistence", async () => {
    vi.resetModules();
    vi.stubEnv("DOCKER_PROXY_URL", "");
    const { getService } = await import("./services.js");
    expect((await getService("docker")).data.configured).toBe(false);
    expect(mocks.prisma.integration.upsert).not.toHaveBeenCalled();
  });
  it("returns down without inventing data on the first failure", async () => {
    vi.resetModules();
    vi.stubEnv("DOCKER_PROXY_URL", "http://proxy");
    mocks.collect.mockRejectedValue(new Error("offline"));
    mocks.prisma.integrationSnapshot.findUnique.mockResolvedValue(null);
    mocks.prisma.integrationHealth.findUnique.mockResolvedValue(null);
    const { getService } = await import("./services.js");
    const result = await getService("docker");
    expect(result.data.health.state).toBe("down");
    expect(result.data.snapshot).toBeNull();
  });
});
