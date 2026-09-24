import { expect, it, vi } from "vitest";
import { defaultCareerProfile } from "@homebase/career-engine";
import type { CareerJobDraft } from "@homebase/domain";
import { enrichCareerSalaries, salaryIdentity, salaryQueryTitle, type SalaryStore } from "./career-salary.js";

const role: CareerJobDraft = {
  externalId: "trace3",
  title: "Security Operations Center (SOC) Analyst (Remote)",
  company: "Trace3",
  location: "Anywhere, ND, US",
  arrangement: "remote",
  description: "Splunk SIEM EDR incident response threat hunting Microsoft Sentinel",
  source: "jsearch",
  sourceUrl: "https://example.com/jobs/trace3",
};

function memoryStore() {
  let entries = {};
  let reservedAt = 0;
  return {
    store: {
      read: async () => entries,
      reserve: async (now) => {
        if (now.getTime() - reservedAt < 86_400_000) return false;
        reservedAt = now.getTime();
        return true;
      },
      write: async (value) => {
        entries = value;
      },
    } satisfies SalaryStore,
    entries: () => entries,
  };
}

it("enriches only the strongest salary-missing role and reuses its 30-day cache", async () => {
  const memory = memoryStore();
  const provider = {
    estimate: vi
      .fn()
      .mockResolvedValue({ salaryMin: 80000, salaryMax: 110000, salaryCurrency: "USD", source: "Glassdoor" }),
  };
  const lower = { ...role, externalId: "lower", title: "Threat Intelligence Analyst", description: "Threat hunting" };
  const now = new Date("2026-09-10T12:00:00Z");
  const first = await enrichCareerSalaries(
    {} as never,
    "key",
    defaultCareerProfile,
    [lower, role],
    provider,
    now,
    memory.store,
  );
  expect(provider.estimate).toHaveBeenCalledTimes(1);
  expect(provider.estimate).toHaveBeenCalledWith("soc analyst");
  expect(first.find((job) => job.externalId === "trace3")).toMatchObject({
    salaryMin: 80000,
    salaryMax: 110000,
    salaryEstimated: true,
    salaryEstimateSource: "Glassdoor",
  });
  expect(first.find((job) => job.externalId === "lower")?.salaryMin).toBeUndefined();
  const restarted = await enrichCareerSalaries(
    {} as never,
    "key",
    defaultCareerProfile,
    [role],
    provider,
    new Date("2026-09-20"),
    memory.store,
  );
  expect(restarted[0]?.salaryEstimated).toBe(true);
  expect(provider.estimate).toHaveBeenCalledTimes(1);
});

it("uses the closest target title for market estimates", () => {
  expect(salaryQueryTitle("Security Operations Center (SOC) Analyst (Remote)", defaultCareerProfile)).toBe(
    "soc analyst",
  );
  expect(salaryQueryTitle("Threat Intelligence Specialist (Remote)", defaultCareerProfile)).toBe(
    "threat intelligence specialist",
  );
});

it("does not spend requests on weak roles, repeat misses, or more than one role per day", async () => {
  const memory = memoryStore();
  const provider = { estimate: vi.fn().mockResolvedValue(undefined) };
  const weak = { ...role, title: "Security Compliance Coordinator", description: "Policy documentation" };
  await enrichCareerSalaries(
    {} as never,
    "key",
    defaultCareerProfile,
    [weak],
    provider,
    new Date("2026-09-10"),
    memory.store,
  );
  expect(provider.estimate).not.toHaveBeenCalled();
  await enrichCareerSalaries(
    {} as never,
    "key",
    defaultCareerProfile,
    [role],
    provider,
    new Date("2026-09-10"),
    memory.store,
  );
  await enrichCareerSalaries(
    {} as never,
    "key",
    defaultCareerProfile,
    [role],
    provider,
    new Date("2026-09-11"),
    memory.store,
  );
  expect(provider.estimate).toHaveBeenCalledTimes(1);
  expect(memory.entries()).toHaveProperty(salaryIdentity(role.title));
});

it("keeps published compensation authoritative", async () => {
  const memory = memoryStore();
  const provider = { estimate: vi.fn() };
  const published = { ...role, salaryMin: 90000, salaryMax: 120000, salaryCurrency: "USD" };
  const result = await enrichCareerSalaries(
    {} as never,
    "key",
    defaultCareerProfile,
    [published],
    provider,
    new Date("2026-09-10"),
    memory.store,
  );
  expect(result[0]).toEqual(published);
  expect(provider.estimate).not.toHaveBeenCalled();
});
