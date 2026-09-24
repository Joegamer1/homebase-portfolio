import { afterEach, expect, it, vi } from "vitest";
import { defaultCareerProfile, normalizeCareerJob } from "@homebase/career-engine";

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  boards: [{ token: "test", company: "Test" }],
  prisma: {
    careerProfile: { upsert: vi.fn(), update: vi.fn() },
    jobPosting: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    integration: { upsert: vi.fn().mockResolvedValue({ id: "integration" }) },
    collectorRun: { create: vi.fn().mockResolvedValue({ id: "run" }), update: vi.fn() },
    integrationSnapshot: { upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    integrationHealth: { upsert: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      return mocks.prisma;
    }
  },
  IntegrationState: { HEALTHY: "HEALTHY", DEGRADED: "DEGRADED", DOWN: "DOWN" },
}));
vi.mock("@homebase/collectors", async (importOriginal) => ({
  isRelevantTitle: (await importOriginal<typeof import("@homebase/collectors")>()).isRelevantTitle,
  inferArrangement: (await importOriginal<typeof import("@homebase/collectors")>()).inferArrangement,
  GreenhouseJobProvider: class {
    name: string;
    constructor(board: { token: string }) {
      this.name = `greenhouse:${board.token}`;
    }
    collect = () => mocks.collect(this.name);
  },
  MockJobProvider: class {},
  LeverJobProvider: class {},
  AshbyJobProvider: class {},
  parseGreenhouseBoards: (value: string) => (value.includes("gitlab") ? mocks.boards : []),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.boards = [{ token: "test", company: "Test" }];
});

it("upgrades the original career title profile without overwriting later custom profiles", async () => {
  vi.resetModules();
  vi.stubEnv("CAREER_MOCK_ENABLED", "false");
  const legacy = {
    ...defaultCareerProfile,
    targetTitles: ["soc analyst", "security analyst", "incident response", "detection engineer", "security engineer"],
  };
  mocks.prisma.careerProfile.upsert.mockResolvedValue(legacy);
  mocks.prisma.careerProfile.update.mockResolvedValue(defaultCareerProfile);
  mocks.collect.mockResolvedValue([]);
  await (await import("./career.js")).collectCareer();
  expect(mocks.prisma.careerProfile.update).toHaveBeenCalledWith({
    where: { id: "sample-user" },
    data: {
      targetTitles: defaultCareerProfile.targetTitles,
      advancementTerms: defaultCareerProfile.advancementTerms,
    },
  });
});

it("filters before limiting and keeps current status through cached reads, outages, and restart", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("CAREER_MOCK_ENABLED", "false");
  vi.stubEnv("CAREER_MAX_JOBS", "10");
  const job = normalizeCareerJob({
    externalId: "1",
    title: "Detection Engineer",
    company: "Test",
    location: "Remote, US",
    arrangement: "remote",
    source: "greenhouse:test",
    salaryMin: 100000,
    description: "SIEM Splunk EDR Python Linux incident response threat hunting detection engineering",
  });
  mocks.prisma.careerProfile.upsert.mockResolvedValue(defaultCareerProfile);
  let status = "NEW";
  const row = () => ({
    ...job,
    status,
    firstSeenAt: new Date(job.firstSeenAt),
    lastSeenAt: new Date(job.lastSeenAt),
    postedAt: null,
  });
  mocks.prisma.jobPosting.findMany.mockImplementation(async () => [row()]);
  mocks.prisma.jobPosting.upsert.mockImplementation(async () => row());
  mocks.prisma.jobPosting.update.mockImplementation(async ({ data }) => {
    status = data.status;
    return row();
  });
  mocks.collect.mockResolvedValue([
    ...Array.from({ length: 12 }, (_, i) => ({ ...job, externalId: `foreign-${i}`, location: "Remote, Canada" })),
    job,
  ]);
  const api = await import("./career.js");
  const first = await api.getCareer();
  expect(first.data.snapshot?.jobs).toHaveLength(1);
  expect(first.data.snapshot?.signals).toHaveLength(1);
  expect(mocks.prisma.jobPosting.upsert).toHaveBeenCalledTimes(1);
  await api.updateCareerJobStatus(job.id, "applied");
  expect((await api.getCareer()).data.snapshot?.signals).toHaveLength(0);
  expect(mocks.collect).toHaveBeenCalledTimes(1);
  mocks.prisma.integrationSnapshot.findUnique.mockResolvedValue({ payload: first.data.snapshot });
  mocks.collect.mockRejectedValue(new Error("offline"));
  vi.resetModules();
  const restarted = await import("./career.js");
  const stale = await restarted.getCareer();
  expect(stale.data.snapshot?.stale).toBe(true);
  expect(stale.data.snapshot?.jobs[0].status).toBe("applied");
  expect(stale.data.snapshot?.jobs[0].stale).toBe(true);
  expect(stale.data.snapshot?.providers[0]).toMatchObject({ state: "down" });
  expect(stale.data.snapshot?.signals).toHaveLength(0);
  expect(mocks.prisma.integrationSnapshot.update).toHaveBeenCalled();
});

it("retains failed-provider jobs with their original timestamp and marks recovered empty results unavailable", async () => {
  vi.resetModules();
  mocks.boards = [
    { token: "test", company: "Test" },
    { token: "other", company: "Other" },
  ];
  mocks.prisma.careerProfile.upsert.mockResolvedValue(defaultCareerProfile);
  const old = normalizeCareerJob(
    {
      externalId: "old",
      title: "Security Analyst",
      company: "Test",
      location: "US",
      arrangement: "remote",
      source: "greenhouse:test",
      description: "SIEM",
    },
    defaultCareerProfile,
    "2026-09-09T12:00:00.000Z",
  );
  mocks.prisma.integrationSnapshot.findUnique.mockImplementation(async ({ where }) =>
    where.integrationKey === "career-source:greenhouse:test" ? { payload: { jobs: [old] } } : null,
  );
  mocks.collect.mockImplementation(async (source) => {
    if (source === "greenhouse:test") throw new Error("offline");
    return [];
  });
  const { collectCareer } = await import("./career.js");
  const result = await collectCareer();
  expect(result.data.snapshot?.jobs[0]).toMatchObject({ id: old.id, stale: true, lastSeenAt: old.lastSeenAt });
  expect(result.data.health.state).toBe("degraded");
  expect(mocks.prisma.jobPosting.upsert).not.toHaveBeenCalled();
  expect(
    mocks.prisma.integrationSnapshot.upsert.mock.calls.some(
      ([arg]) => arg.where.integrationKey === "career-source:greenhouse:test",
    ),
  ).toBe(false);
  mocks.collect.mockResolvedValue([]);
  const recovered = await collectCareer();
  expect(recovered.data.snapshot?.jobs).toEqual([]);
  expect(recovered.data.health.state).toBe("healthy");
});

it("imports canonical LinkedIn listings, scores them and preserves status on reimport", async () => {
  vi.resetModules();
  mocks.prisma.careerProfile.upsert.mockResolvedValue(defaultCareerProfile);
  mocks.prisma.jobPosting.upsert.mockImplementation(async ({ create }) => ({
    ...create,
    id: "imported",
    status: "APPLIED",
  }));
  const { importCareerJob } = await import("./career.js");
  const input = {
    title: "Detection Engineer",
    company: "Example",
    location: "Remote, US",
    arrangement: "remote",
    sourceUrl: "https://www.linkedin.com/jobs/view/detection-engineer-12345/?trackingId=secret",
    description:
      "SIEM Splunk Python Linux EDR incident response threat hunting detection engineering and security monitoring.",
  };
  const result = await importCareerJob(input);
  expect(result.data).toMatchObject({
    id: "imported",
    source: "linkedin",
    externalId: "12345",
    sourceUrl: "https://www.linkedin.com/jobs/view/12345/",
    status: "applied",
  });
  expect(result.data.matchScore).toBeGreaterThanOrEqual(75);
  expect(mocks.prisma.jobPosting.upsert.mock.calls[0][0].update).not.toHaveProperty("status");
  await expect(
    importCareerJob({ ...input, description: `${input.description} Hybrid schedule required.` }),
  ).rejects.toThrow("US remote");
  await expect(importCareerJob({ ...input, location: "Canada" })).rejects.toThrow("US remote");
  await expect(
    importCareerJob({ ...input, sourceUrl: "https://linkedin.com.evil.test/jobs/view/12345/" }),
  ).rejects.toThrow();
  await expect(importCareerJob({ ...input, sourceUrl: "https://www.linkedin.com/jobs/search/" })).rejects.toThrow();
});

it("keeps an imported job visible after restoring new status during a total feed outage", async () => {
  vi.resetModules();
  mocks.prisma.careerProfile.upsert.mockResolvedValue(defaultCareerProfile);
  mocks.collect.mockRejectedValue(new Error("offline"));
  mocks.prisma.integrationSnapshot.findUnique.mockResolvedValue(null);
  const job = normalizeCareerJob({
    externalId: "abc123",
    title: "Security Analyst",
    company: "Example",
    source: "indeed",
    sourceUrl: "https://www.indeed.com/viewjob?jk=abc123",
    location: "US",
    arrangement: "remote",
    description: "SIEM incident response",
  });
  mocks.prisma.jobPosting.findMany.mockResolvedValue([
    {
      ...job,
      status: "NEW",
      firstSeenAt: new Date(job.firstSeenAt),
      lastSeenAt: new Date(job.lastSeenAt),
      postedAt: null,
    },
  ]);
  const { getCareer } = await import("./career.js");
  const result = await getCareer();
  expect(result.data.snapshot?.jobs).toHaveLength(1);
  expect(result.data.snapshot?.jobs[0]).toMatchObject({ source: "indeed", status: "new" });
  expect(result.data.snapshot?.jobs[0].available).toBeUndefined();
});

it("retains removed new jobs outside the current results and overlays daily availability", async () => {
  vi.resetModules();
  mocks.prisma.careerProfile.upsert.mockResolvedValue(defaultCareerProfile);
  mocks.collect.mockResolvedValue([]);
  const job = normalizeCareerJob(
    {
      externalId: "removed-1",
      title: "Detection Engineer",
      company: "Test",
      source: "greenhouse:test",
      location: "Remote, US",
      arrangement: "remote",
      description: "SIEM incident response",
    },
    defaultCareerProfile,
    "2026-09-09T00:00:00Z",
  );
  mocks.prisma.jobPosting.findMany.mockResolvedValue([
    {
      ...job,
      status: "NEW",
      firstSeenAt: new Date(job.firstSeenAt),
      lastSeenAt: new Date(job.lastSeenAt),
      postedAt: null,
    },
  ]);
  mocks.prisma.integrationSnapshot.findUnique.mockImplementation(async ({ where }) =>
    where.integrationKey === "career-availability"
      ? {
          payload: {
            checkedAt: "2026-09-10T00:00:00Z",
            checks: [{ id: job.id, state: "removed", reason: "Removed from employer job board" }],
          },
        }
      : null,
  );
  const result = await (await import("./career.js")).getCareer();
  expect(result.data.snapshot?.availabilityCheckedAt).toBe("2026-09-10T00:00:00Z");
  expect(result.data.snapshot?.jobs[0]).toMatchObject({ id: job.id, available: false, status: "new" });
  expect(result.data.snapshot?.signals).toEqual([]);
});
