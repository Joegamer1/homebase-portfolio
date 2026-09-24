import { afterEach, expect, it, vi } from "vitest";
import { apiEnvironmentSchema } from "@homebase/config";

const mocks = vi.hoisted(() => ({
  collect: vi.fn().mockResolvedValue(undefined),
  jobs: [] as { name: string; intervalMs: number; run: () => Promise<unknown> }[],
}));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    collectorRun = { updateMany: vi.fn(), deleteMany: vi.fn() };
  },
}));
vi.mock("./proxmox.js", () => ({ collectProxmox: vi.fn() }));
vi.mock("./services.js", () => ({ collectService: vi.fn() }));
vi.mock("./security.js", () => ({ collectSecurity: vi.fn() }));
vi.mock("./career-availability.js", () => ({
  checkCareerAvailability: vi.fn(),
  CAREER_AVAILABILITY_INTERVAL_MS: 86400000,
}));
vi.mock("./career.js", () => ({ collectCareer: vi.fn() }));
vi.mock("./home-systems.js", async (original) => ({
  ...(await original<typeof import("./home-systems.js")>()),
  collectHomeSystem: mocks.collect,
}));
vi.mock("./scheduler.js", () => ({
  startScheduler: (jobs: typeof mocks.jobs) => {
    mocks.jobs = jobs;
    return vi.fn();
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("registers independent worker collection jobs with the configured Plex interval", async () => {
  vi.stubEnv("PLEX_REFRESH_SECONDS", "5");
  vi.stubEnv("HOME_SYSTEM_REFRESH_SECONDS", "120");
  vi.spyOn(process, "on").mockReturnValue(process);
  await import("./worker.js");
  expect(mocks.jobs.find((job) => job.name === "career-availability")?.intervalMs).toBe(86400000);
  const plex = mocks.jobs.find((job) => job.name === "plex")!;
  expect(plex.intervalMs).toBe(5000);
  await plex.run();
  expect(mocks.collect).toHaveBeenCalledWith("plex");
  for (const source of ["pihole", "home-assistant", "tailscale"])
    expect(mocks.jobs.find((job) => job.name === source)?.intervalMs).toBe(120000);
});

it("defaults Plex to 15 seconds and validates the independent 5–300 second range", () => {
  expect(apiEnvironmentSchema.parse({}).PLEX_REFRESH_SECONDS).toBe(15);
  for (const value of [5, 300])
    expect(apiEnvironmentSchema.parse({ PLEX_REFRESH_SECONDS: String(value) }).PLEX_REFRESH_SECONDS).toBe(value);
  for (const value of [4, 301, 15.5, "invalid"])
    expect(apiEnvironmentSchema.safeParse({ PLEX_REFRESH_SECONDS: value }).success).toBe(false);
});
