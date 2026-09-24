import { beforeEach, expect, it, vi } from "vitest";
import { normalizeCareerJob } from "@homebase/career-engine";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() }));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    jobPosting = { findMany: mocks.findMany };
    integrationSnapshot = { upsert: mocks.upsert, findUnique: mocks.findUnique };
  },
}));
import {
  applyCareerAvailability,
  auditCareerPostings,
  checkCareerAvailability,
  CAREER_AVAILABILITY_KEY,
} from "./career-availability.js";
const now = new Date("2026-09-10T12:00:00Z");
const job = normalizeCareerJob(
  {
    title: "Detection Engineer",
    company: "Example",
    externalId: "1",
    source: "greenhouse:example",
    location: "Remote, US",
    arrangement: "remote",
    description: "SIEM incident response",
  },
  undefined,
  "2026-09-09T12:00:00Z",
);
const posting = { id: job.id, externalId: job.externalId, source: job.source, sourceUrl: null };
beforeEach(() => vi.clearAllMocks());

it("checks full inventories and differentiates removal, active jobs and failed sources", async () => {
  const collect = vi.fn().mockResolvedValue([{ ...job, title: "Renamed role outside career title filter" }]);
  const audit = await auditCareerPostings(
    [posting, { ...posting, id: "gone", externalId: "2" }, { ...posting, id: "outage", source: "lever:outage" }],
    [
      { name: job.source, collect },
      { name: "lever:outage", collect: vi.fn().mockRejectedValue(new Error("429")) },
    ],
    vi.fn(),
    now,
  );
  expect(collect).toHaveBeenCalledWith(true);
  expect(audit.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: job.id, state: "available" }),
      expect.objectContaining({ id: "gone", state: "removed" }),
      expect.objectContaining({ id: "outage", state: "unknown" }),
    ]),
  );
});

it("only treats 404/410 as removed for imports and never follows redirects or arbitrary URLs", async () => {
  const request = vi
    .fn()
    .mockImplementation(
      async (url: string) => new Response("", { status: Number(new URL(url).searchParams.get("jk")) }),
    );
  const statuses = [200, 302, 403, 404, 410, 429, 500];
  const audit = await auditCareerPostings(
    [
      ...statuses.map((status) => ({
        ...posting,
        id: String(status),
        source: "indeed",
        sourceUrl: `https://www.indeed.com/viewjob?jk=${status}`,
      })),
      { ...posting, id: "unsafe", source: "indeed", sourceUrl: "http://127.0.0.1/private" },
    ],
    [],
    request,
    now,
  );
  expect(request).toHaveBeenCalledTimes(statuses.length);
  expect(request).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: "manual" }));
  expect(
    audit.checks
      .filter((check) => check.state === "removed")
      .map((check) => check.id)
      .sort(),
  ).toEqual(["404", "410"]);
  expect(audit.checks.find((check) => check.id === "unsafe")?.state).toBe("unknown");
});

it("preserves application status and allows newer collection evidence to reopen a listing", () => {
  const audit = {
    checkedAt: now.toISOString(),
    checks: [{ id: job.id, state: "removed" as const, reason: "Removed" }],
  };
  expect(applyCareerAvailability({ ...job, status: "applied" }, audit)).toMatchObject({
    status: "applied",
    available: false,
    availabilityCheckedAt: audit.checkedAt,
  });
  expect(
    applyCareerAvailability({ ...job, available: true, lastSeenAt: "2026-09-10T13:00:00Z" }, audit).available,
  ).toBe(true);
  expect(
    applyCareerAvailability(job, { ...audit, checks: [{ id: job.id, state: "unknown", reason: "Source down" }] })
      .available,
  ).toBeUndefined();
});

it("persists audit results independently of job statuses and coalesces overlapping runs", async () => {
  mocks.findMany.mockResolvedValue([{ ...posting, source: "disabled:board" }]);
  mocks.upsert.mockResolvedValue({});
  const first = checkCareerAvailability();
  const second = checkCareerAvailability();
  expect(first).toBe(second);
  await first;
  expect(mocks.findMany).toHaveBeenCalledTimes(1);
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { integrationKey: CAREER_AVAILABILITY_KEY },
      update: expect.objectContaining({
        payload: expect.objectContaining({ checks: [expect.objectContaining({ state: "unknown" })] }),
      }),
    }),
  );
});

it("audits search records against the actual employer requisition, not the search ID", async () => {
  const collect = vi.fn().mockResolvedValue([{ externalId: "123" }]);
  const audit = await auditCareerPostings(
    [
      {
        ...posting,
        id: "open-search",
        source: "jsearch",
        externalId: "google-one",
        sourceUrl: "https://job-boards.greenhouse.io/example/jobs/123",
      },
      {
        ...posting,
        id: "closed-search",
        source: "jsearch",
        externalId: "google-two",
        sourceUrl: "https://job-boards.greenhouse.io/example/jobs/456",
      },
    ],
    [{ name: "greenhouse:example", collect }],
    vi.fn(),
    now,
  );
  expect(collect).toHaveBeenCalledTimes(1);
  expect(audit.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "open-search", state: "available" }),
      expect.objectContaining({ id: "closed-search", state: "removed" }),
    ]),
  );
});
it("does not let a newer search snippet override employer-confirmed removal", () => {
  expect(
    applyCareerAvailability(
      { ...job, source: "jsearch", available: true, lastSeenAt: "2026-09-11T12:00:00Z" },
      {
        checkedAt: now.toISOString(),
        checks: [{ id: job.id, state: "removed", reason: "Employer removed job" }],
      },
    ).available,
  ).toBe(false);
});
it("leaves unsupported search URLs and redirects unverified without requesting private hosts", async () => {
  const request = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
  const audit = await auditCareerPostings(
    [
      { ...posting, source: "jsearch", sourceUrl: "https://127.0.0.1/private" },
      { ...posting, id: "linkedin", source: "jsearch", sourceUrl: "https://www.linkedin.com/jobs/view/123" },
    ],
    [],
    request,
    now,
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(audit.checks.every((check) => check.state === "unknown")).toBe(true);
});

it("retains confirmed closures when the next employer check is inconclusive", async () => {
  mocks.findMany.mockResolvedValue([{ ...posting, source: "disabled:board" }]);
  mocks.findUnique.mockResolvedValue({
    payload: {
      checkedAt: now.toISOString(),
      checks: [{ id: job.id, state: "removed", reason: "Removed from employer board" }],
    },
  });
  mocks.upsert.mockResolvedValue({});
  const audit = await checkCareerAvailability();
  expect(audit.checks[0]).toMatchObject({ state: "removed", reason: expect.stringContaining("inconclusive") });
});
