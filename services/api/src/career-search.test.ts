import { expect, it, vi } from "vitest";
import { defaultCareerProfile, normalizeCareerJob } from "@homebase/career-engine";
import { DailyCareerSearch, deduplicateCareerJobs, type SearchCache, type SearchStore } from "./career-search.js";

const job = normalizeCareerJob({
  externalId: "1",
  title: "Security Analyst",
  company: "Example",
  location: "Remote, US",
  arrangement: "remote",
  description: "Splunk SIEM",
  source: "jsearch",
  sourceUrl: "https://jobs.lever.co/example/1/apply?utm_source=google",
});
function store() {
  let cache: SearchCache | undefined;
  let reserved = 0;
  return {
    read: async () => cache,
    reserve: async (now: Date) => {
      if (now.getTime() - reserved < 86400000) return false;
      reserved = now.getTime();
      return true;
    },
    write: async (value: SearchCache) => {
      cache = value;
    },
  } satisfies SearchStore;
}
it("shares a durable daily allowance across restarts and deduplicates overlapping queries", async () => {
  const storage = store();
  let now = new Date("2026-09-10T12:00:00Z");
  const search = vi.fn().mockResolvedValue([job]);
  const create = () => new DailyCareerSearch(defaultCareerProfile, storage, search, () => now);
  expect(await create().collect()).toHaveLength(1);
  expect(search).toHaveBeenCalledTimes(5);
  now = new Date("2026-09-10T18:00:00Z");
  const restarted = create();
  await restarted.collect();
  expect(restarted.collectedAt).toBe("2026-09-10T12:00:00.000Z");
  expect(search).toHaveBeenCalledTimes(5);
  now = new Date("2026-09-11T12:00:00Z");
  await create().collect();
  expect(search).toHaveBeenCalledTimes(10);
});
it("rotates the five daily queries so cloud targets are searched", async () => {
  const storage = store();
  const search = vi.fn().mockResolvedValue([]);
  const profile = {
    ...defaultCareerProfile,
    targetTitles: [
      "security analyst",
      "soc analyst",
      "security engineer",
      "detection engineer",
      "iam analyst",
      "cloud security engineer",
      "cloud engineer",
    ],
  };
  await new DailyCareerSearch(profile, storage, search, () => new Date("2026-09-10T12:00:00Z")).collect();
  await new DailyCareerSearch(profile, storage, search, () => new Date("2026-09-11T12:00:00Z")).collect();
  expect(new Set(search.mock.calls.map(([query]) => query))).toEqual(new Set(profile.targetTitles));
});
it("does not retry failed batches or replace the last good cache", async () => {
  const storage = store();
  let now = new Date("2026-09-10T12:00:00Z");
  const search = vi.fn().mockResolvedValue([job]);
  const create = () => new DailyCareerSearch(defaultCareerProfile, storage, search, () => now);
  await create().collect();
  now = new Date("2026-09-11T12:00:00Z");
  search.mockRejectedValue(new Error("HTTP 429"));
  await expect(create().collect()).rejects.toThrow("429");
  await expect(create().collect()).rejects.toThrow("allowance");
  expect(search).toHaveBeenCalledTimes(10);
  expect((await storage.read())?.collectedAt).toBe("2026-09-10T12:00:00.000Z");
});
it("allows only one concurrent batch", async () => {
  const storage = store();
  const search = vi.fn().mockResolvedValue([job]);
  const make = () => new DailyCareerSearch(defaultCareerProfile, storage, search, () => new Date("2026-09-10"));
  const results = await Promise.allSettled([make().collect(), make().collect()]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(search).toHaveBeenCalledTimes(5);
});
it("hides duplicate new results while preserving all tracked records and distinct requisitions", () => {
  const employer = { ...job, id: "employer", source: "lever:example", sourceUrl: "https://jobs.lever.co/example/1" };
  expect(deduplicateCareerJobs([job, employer])).toEqual([employer]);
  for (const status of ["saved", "applied", "dismissed"] as const) {
    const tracked = { ...job, status };
    expect(deduplicateCareerJobs([employer, tracked])).toEqual([tracked]);
  }
  const saved = { ...job, status: "saved" as const };
  const applied = { ...employer, status: "applied" as const };
  expect(deduplicateCareerJobs([saved, applied])).toHaveLength(2);
  expect(
    deduplicateCareerJobs([job, { ...job, externalId: "2", sourceUrl: "https://jobs.lever.co/example/2" }]),
  ).toHaveLength(2);
});

it("retains previous rotating samples, refreshes rediscovered jobs, and expires unseen jobs after 30 days", async () => {
  const storage = store();
  let now = new Date("2026-09-10T12:00:00Z");
  const search = vi.fn().mockResolvedValue([job]);
  const collect = () => new DailyCareerSearch(defaultCareerProfile, storage, search, () => now).collect();
  await collect();
  now = new Date("2026-09-11T12:00:00Z");
  search.mockResolvedValue([{ ...job, externalId: "2" }]);
  const second = await collect();
  expect(second).toHaveLength(2);
  expect(second[0]).toMatchObject({ lastSeenAt: "2026-09-10T12:00:00.000Z" });
  now = new Date("2026-09-12T12:00:00Z");
  search.mockResolvedValue([{ ...job, title: "Updated Security Analyst" }]);
  const third = await collect();
  expect(third[0]).toMatchObject({
    title: "Updated Security Analyst",
    firstSeenAt: "2026-09-10T12:00:00.000Z",
    lastSeenAt: "2026-09-12T12:00:00.000Z",
  });
  now = new Date("2026-10-11T12:00:00Z");
  search.mockResolvedValue([]);
  expect(await collect()).toHaveLength(1);
  now = new Date("2026-10-12T12:00:00Z");
  expect(await collect()).toHaveLength(0);
});

it("repairs cached Anywhere results without another paid search", async () => {
  const storage = store();
  await storage.write({
    collectedAt: "2026-09-10T12:00:00Z",
    jobs: [{ ...job, location: "Anywhere", title: "Security Analyst - Remote US" }],
  });
  const search = vi.fn();
  const jobs = await new DailyCareerSearch(
    defaultCareerProfile,
    storage,
    search,
    () => new Date("2026-09-10T13:00:00Z"),
  ).collect();
  expect(jobs[0]?.location).toBe("Remote, United States");
  expect(search).not.toHaveBeenCalled();
});
