import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const snapshot = {
    source: "tailscale",
    collectedAt: "2026-09-08T12:00:00.000Z",
    stale: false,
    metrics: [],
    entities: [],
    signals: [],
  };
  return {
    snapshot,
    collect: vi.fn(),
    prisma: {
      integration: { findUnique: vi.fn(), upsert: vi.fn().mockResolvedValue({ id: "integration" }) },
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
  MockFoundationCollector: class {},
  HomeSystemCollector: class {
    collect = mocks.collect;
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("home-system persistence", () => {
  it("persists, falls back to stale data, caches failures, and recovers", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv("TAILSCALE_STATUS_URL", "http://adapter/tailscale/status");
    vi.stubEnv("HOME_SYSTEM_REFRESH_SECONDS", "30");
    mocks.collect.mockResolvedValue(mocks.snapshot);
    const { getHomeSystem } = await import("./home-systems.js");

    expect((await getHomeSystem("tailscale")).data.health.state).toBe("healthy");
    expect(mocks.prisma.integrationSnapshot.upsert).toHaveBeenCalled();

    vi.advanceTimersByTime(31000);
    mocks.collect.mockRejectedValue(new Error("provider secret"));
    mocks.prisma.integrationSnapshot.findUnique.mockResolvedValue({ payload: mocks.snapshot });
    mocks.prisma.integrationHealth.findUnique.mockResolvedValue({
      lastSuccessAt: new Date(mocks.snapshot.collectedAt),
    });
    const stale = await getHomeSystem("tailscale");
    expect(stale.data.health.state).toBe("degraded");
    expect(stale.data.snapshot?.stale).toBe(true);
    expect(JSON.stringify(stale)).not.toContain("provider secret");
    await getHomeSystem("tailscale");
    expect(mocks.collect).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(31000);
    mocks.collect.mockResolvedValue(mocks.snapshot);
    expect((await getHomeSystem("tailscale")).data.health.state).toBe("healthy");
  });

  it("returns disabled without touching persistence", async () => {
    vi.resetModules();
    vi.stubEnv("TAILSCALE_STATUS_URL", "");
    const { getHomeSystem } = await import("./home-systems.js");
    expect((await getHomeSystem("tailscale")).data.configured).toBe(false);
    expect(mocks.prisma.integration.upsert).not.toHaveBeenCalled();
  });
});

it("expires Plex demand cache independently of slower home systems", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("COLLECTION_MODE", "demand");
  vi.stubEnv("PLEX_BASE_URL", "http://plex.local");
  vi.stubEnv("PLEX_TOKEN", "test");
  vi.stubEnv("TAILSCALE_STATUS_URL", "http://adapter/status");
  vi.stubEnv("PLEX_REFRESH_SECONDS", "15");
  vi.stubEnv("HOME_SYSTEM_REFRESH_SECONDS", "120");
  mocks.collect.mockResolvedValue(mocks.snapshot);
  const { getHomeSystem } = await import("./home-systems.js");
  await getHomeSystem("plex");
  await getHomeSystem("tailscale");
  vi.advanceTimersByTime(14999);
  await getHomeSystem("plex");
  expect(mocks.collect).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(1);
  await getHomeSystem("plex");
  await getHomeSystem("tailscale");
  expect(mocks.collect).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(105000);
  await getHomeSystem("tailscale");
  expect(mocks.collect).toHaveBeenCalledTimes(4);
});

it("uses Plex cadence for worker snapshot freshness without provider I/O", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(mocks.snapshot.collectedAt));
  vi.stubEnv("COLLECTION_MODE", "worker");
  vi.stubEnv("PLEX_BASE_URL", "http://plex.local");
  vi.stubEnv("PLEX_TOKEN", "test");
  vi.stubEnv("PLEX_REFRESH_SECONDS", "15");
  vi.stubEnv("HOME_SYSTEM_REFRESH_SECONDS", "120");
  vi.stubEnv("TAILSCALE_STATUS_URL", "http://adapter/status");
  mocks.prisma.integrationSnapshot.findUnique.mockResolvedValue({ payload: mocks.snapshot });
  mocks.prisma.integration.findUnique.mockResolvedValue({ health: { state: "HEALTHY", lastAttemptAt: new Date() } });
  const { getHomeSystem } = await import("./home-systems.js");
  expect((await getHomeSystem("plex")).data.health.nextRefreshAt).toBe("2026-09-08T12:00:15.000Z");
  vi.advanceTimersByTime(31000);
  expect((await getHomeSystem("plex")).data.health.stale).toBe(true);
  expect((await getHomeSystem("tailscale")).data.health.stale).toBe(false);
  expect(mocks.collect).not.toHaveBeenCalled();
});
