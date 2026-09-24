import { isEligibleCareerJob, normalizeCareerJob } from "@homebase/career-engine";
import { JobSalaryProvider, type CareerSalaryEstimate } from "@homebase/collectors";
import type { CareerJobDraft, CareerProfile } from "@homebase/domain";
import type { Prisma, PrismaClient } from "@prisma/client";

const DAY = 86_400_000;
const CACHE_DAYS = 30;
const CACHE_KEY = "career-salary-cache";
const BUDGET_KEY = "career-salary-budget";

interface CacheEntry {
  checkedAt: string;
  estimate?: CareerSalaryEstimate;
}

export interface SalaryStore {
  read(): Promise<Record<string, CacheEntry>>;
  reserve(now: Date): Promise<boolean>;
  write(entries: Record<string, CacheEntry>, now: Date): Promise<void>;
}

interface SalaryEstimator {
  estimate(title: string): Promise<CareerSalaryEstimate | undefined>;
}

const validEntry = (value: unknown): value is CacheEntry => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.checkedAt === "string" && Number.isFinite(Date.parse(row.checkedAt));
};

export function databaseSalaryStore(prisma: PrismaClient): SalaryStore {
  return {
    async read() {
      const row = await prisma.integrationSnapshot.findUnique({ where: { integrationKey: CACHE_KEY } });
      const payload = row?.payload as { entries?: unknown } | undefined;
      if (!payload?.entries || typeof payload.entries !== "object" || Array.isArray(payload.entries)) return {};
      return Object.fromEntries(
        Object.entries(payload.entries).filter((entry): entry is [string, CacheEntry] => validEntry(entry[1])),
      );
    },
    async reserve(now) {
      await prisma.integrationSnapshot.upsert({
        where: { integrationKey: BUDGET_KEY },
        create: { integrationKey: BUDGET_KEY, collectedAt: new Date(0), payload: {} },
        update: {},
      });
      const claim = await prisma.integrationSnapshot.updateMany({
        where: { integrationKey: BUDGET_KEY, collectedAt: { lte: new Date(now.getTime() - DAY) } },
        data: { collectedAt: now, payload: { reservedRequests: 1 } },
      });
      return claim.count === 1;
    },
    async write(entries, now) {
      const recent = Object.fromEntries(
        Object.entries(entries).filter(([, entry]) => now.getTime() - Date.parse(entry.checkedAt) < 90 * DAY),
      );
      const data = { collectedAt: now, payload: { entries: recent } as unknown as Prisma.InputJsonValue };
      await prisma.integrationSnapshot.upsert({
        where: { integrationKey: CACHE_KEY },
        create: { integrationKey: CACHE_KEY, ...data },
        update: data,
      });
    },
  };
}

export const salaryIdentity = (title: string) =>
  title
    .toLowerCase()
    .replace(/\([^)]*remote[^)]*\)/gi, " ")
    .replace(/\bremote\b/gi, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();

export const salaryQueryTitle = (title: string, profile: CareerProfile) => {
  const normalized = salaryIdentity(title);
  return (
    profile.targetTitles
      .map((target) => salaryIdentity(target))
      .filter((target) => target && normalized.includes(target))
      .sort((a, b) => b.length - a.length)[0] ?? normalized
  );
};

const applyEstimate = (job: CareerJobDraft, estimate: CareerSalaryEstimate): CareerJobDraft => ({
  ...job,
  salaryMin: estimate.salaryMin,
  salaryMax: estimate.salaryMax,
  salaryCurrency: estimate.salaryCurrency,
  salaryEstimated: true,
  salaryEstimateSource: estimate.source,
});

/**
 * Adds cached estimates freely, then spends at most one salary request per
 * rolling 24 hours on the best viable salary-missing role. The free plan has a
 * 50-request hard monthly limit; this design tops out near 31.
 */
export async function enrichCareerSalaries(
  prisma: PrismaClient,
  apiKey: string,
  profile: CareerProfile,
  drafts: CareerJobDraft[],
  provider: SalaryEstimator = new JobSalaryProvider(apiKey),
  now = new Date(),
  store = databaseSalaryStore(prisma),
) {
  const entries = await store.read();
  const fresh = (entry?: CacheEntry) => entry && now.getTime() - Date.parse(entry.checkedAt) < CACHE_DAYS * DAY;
  let jobs = drafts.map((job) => {
    if (job.salaryMin !== undefined || job.salaryMax !== undefined) return job;
    const entry = entries[salaryIdentity(job.title)];
    return fresh(entry) && entry?.estimate ? applyEstimate(job, entry.estimate) : job;
  });
  const candidate = jobs
    .filter((job) => job.salaryMin === undefined && job.salaryMax === undefined && isEligibleCareerJob(job))
    .map((job) => ({ job, scored: normalizeCareerJob(job, profile, now.toISOString()) }))
    .filter(({ scored }) => scored.matchScore >= 60 && scored.careerValueScore >= 70)
    .filter(({ job }) => !fresh(entries[salaryIdentity(job.title)]))
    .sort(
      (a, b) => b.scored.matchScore - a.scored.matchScore || b.scored.careerValueScore - a.scored.careerValueScore,
    )[0];
  if (!candidate || !(await store.reserve(now))) return jobs;

  const identity = salaryIdentity(candidate.job.title);
  let estimate: CareerSalaryEstimate | undefined;
  try {
    estimate = await provider.estimate(salaryQueryTitle(candidate.job.title, profile));
  } catch (error) {
    console.error("Salary enrichment failed", error instanceof Error ? error.message : "unknown error");
  }
  entries[identity] = { checkedAt: now.toISOString(), ...(estimate ? { estimate } : {}) };
  await store.write(entries, now);
  if (estimate)
    jobs = jobs.map((job) =>
      salaryIdentity(job.title) === identity && job.salaryMin === undefined && job.salaryMax === undefined
        ? applyEstimate(job, estimate)
        : job,
    );
  return jobs;
}
