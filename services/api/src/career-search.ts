import { careerSnapshotSchema } from "@homebase/api-contracts";
import { normalizeCareerJob } from "@homebase/career-engine";
import { JSearchJobProvider } from "@homebase/collectors";
import type { CareerJob, CareerJobDraft, CareerProfile, JobProvider } from "@homebase/domain";
import type { PrismaClient, Prisma } from "@prisma/client";
import { restoreSearchLocation } from "./career-search-location.js";

const DAY = 86_400_000;
const CACHE = "career-jsearch-cache";
const BUDGET = "career-jsearch-budget";
export interface SearchCache {
  collectedAt: string;
  jobs: CareerJob[];
}
export interface SearchStore {
  read(): Promise<SearchCache | undefined>;
  reserve(now: Date): Promise<boolean>;
  write(cache: SearchCache): Promise<void>;
}

export function databaseSearchStore(prisma: PrismaClient): SearchStore {
  return {
    async read() {
      const row = await prisma.integrationSnapshot.findUnique({ where: { integrationKey: CACHE } });
      const parsed = careerSnapshotSchema.shape.jobs.safeParse((row?.payload as { jobs?: unknown } | undefined)?.jobs);
      return row && parsed.success ? { collectedAt: row.collectedAt.toISOString(), jobs: parsed.data } : undefined;
    },
    async reserve(now) {
      await prisma.integrationSnapshot.upsert({
        where: { integrationKey: BUDGET },
        create: { integrationKey: BUDGET, collectedAt: new Date(0), payload: {} },
        update: {},
      });
      // Compare-and-swap is atomic across worker/API processes. Reserve all five
      // credits BEFORE network access; errors and crashes never trigger paid retries.
      const claim = await prisma.integrationSnapshot.updateMany({
        where: { integrationKey: BUDGET, collectedAt: { lte: new Date(now.getTime() - DAY) } },
        data: { collectedAt: now, payload: { reservedRequests: 5 } },
      });
      return claim.count === 1;
    },
    async write(cache) {
      const data = {
        collectedAt: new Date(cache.collectedAt),
        payload: { jobs: cache.jobs } as unknown as Prisma.InputJsonValue,
      };
      await prisma.integrationSnapshot.upsert({
        where: { integrationKey: CACHE },
        create: { integrationKey: CACHE, ...data },
        update: data,
      });
    },
  };
}

/** Maximum 5 credits per rolling 24 hours, including failed requests. */
export class DailyCareerSearch implements JobProvider {
  readonly name = "jsearch";
  collectedAt?: string;
  constructor(
    private readonly profile: CareerProfile,
    private readonly store: SearchStore,
    private readonly search: (query: string) => Promise<CareerJobDraft[]>,
    private readonly now = () => new Date(),
  ) {}
  async collect(): Promise<CareerJobDraft[]> {
    const now = this.now();
    const cached = await this.store.read();
    if (cached && now.getTime() - Date.parse(cached.collectedAt) < DAY) {
      this.collectedAt = cached.collectedAt;
      return cached.jobs.map(restoreSearchLocation);
    }
    if (!(await this.store.reserve(now)))
      throw new Error("JSearch daily allowance reserved; awaiting next daily search");
    const titles = [...new Set(this.profile.targetTitles.map((title) => title.trim()).filter(Boolean))];
    const batch = Math.floor(now.getTime() / DAY) % Math.ceil(titles.length / 5);
    const queries = Array.from(
      { length: Math.min(5, titles.length) },
      (_, index) => titles[(batch * 5 + index) % titles.length]!,
    );
    if (!queries.length) throw new Error("JSearch needs target titles in the career profile");
    // A failed batch retains the last successful source snapshot as stale.
    const results = await Promise.all(queries.map((query) => this.search(query)));
    // Daily queries sample different titles, not a complete employer inventory.
    // Absence from today's sample is not removal. Keep a bounded 30-day window
    // without renewing the last-seen timestamp of results not rediscovered.
    const unique = new Map(
      (cached?.jobs ?? [])
        .filter((job) => now.getTime() - Date.parse(job.lastSeenAt) < 30 * DAY)
        .map((job) => [job.externalId, job]),
    );
    for (const draft of results.flat()) {
      const previous = unique.get(draft.externalId);
      const job = normalizeCareerJob(draft, this.profile, now.toISOString());
      unique.set(job.externalId, { ...job, firstSeenAt: previous?.firstSeenAt ?? job.firstSeenAt });
    }
    const jobs = [...unique.values()].map(restoreSearchLocation);
    await this.store.write({ collectedAt: now.toISOString(), jobs });
    this.collectedAt = now.toISOString();
    return jobs;
  }
}

export function createDailyCareerSearch(prisma: PrismaClient, profile: CareerProfile, apiKey: string) {
  return new DailyCareerSearch(profile, databaseSearchStore(prisma), (query) =>
    new JSearchJobProvider(apiKey, query).collect(),
  );
}

// Exact destination identity only: same company/title may be different requisitions.
export function listingIdentity(job: CareerJobDraft): string {
  if (!job.sourceUrl) return `${job.source}:${job.externalId}`;
  try {
    const url = new URL(job.sourceUrl);
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|gh_src$|lever-source$|source$|ref$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/(?:apply|application)\/?$/, "").replace(/\/$/, "");
    return url.toString();
  } catch {
    return `${job.source}:${job.externalId}`;
  }
}

export function deduplicateCareerJobs(jobs: CareerJob[]): CareerJob[] {
  const groups = new Map<string, CareerJob[]>();
  for (const job of jobs) {
    const key = listingIdentity(job);
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  return [...groups.values()].flatMap((group) => {
    // Keep every user-tracked record; hide NEW copies of saved/applied/dismissed jobs.
    const tracked = group.filter((job) => job.status !== "new");
    if (tracked.length) return tracked;
    return [
      group.sort(
        (a, b) =>
          Number(Boolean(a.stale)) - Number(Boolean(b.stale)) ||
          Number(a.source === "jsearch") - Number(b.source === "jsearch"),
      )[0]!,
    ];
  });
}
