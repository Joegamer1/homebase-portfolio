import { employerTarget, supportedListingPage } from "./career-listing-target.js";
import { PrismaClient, type Prisma } from "@prisma/client";
import { careerAvailabilitySchema } from "@homebase/api-contracts";
import { apiEnvironmentSchema } from "@homebase/config";
import { AshbyJobProvider, GreenhouseJobProvider, LeverJobProvider, parseGreenhouseBoards } from "@homebase/collectors";
import type { CareerJob, JobProvider } from "@homebase/domain";

const globalPrisma = globalThis as typeof globalThis & { homebasePrisma?: PrismaClient };
const prisma = globalPrisma.homebasePrisma ?? new PrismaClient();
globalPrisma.homebasePrisma = prisma;
export const CAREER_AVAILABILITY_KEY = "career-availability";
export const CAREER_AVAILABILITY_INTERVAL_MS = 86400000;
type Posting = { id: string; source: string; externalId: string | null; sourceUrl: string | null };
type Audit = ReturnType<typeof careerAvailabilitySchema.parse>;

/** Full source inventories are checked before ranking, eligibility filters, or result caps. */
export async function auditCareerPostings(
  jobs: Posting[],
  providers: JobProvider[],
  request = fetch,
  now = new Date(),
): Promise<Audit> {
  const inventories = new Map<string, Set<string>>();
  const targets = new Map(jobs.map((job) => [job.id, employerTarget(job.sourceUrl)]));
  const expanded = new Map(providers.map((provider) => [provider.name, provider]));
  for (const target of targets.values()) {
    if (!target || expanded.has(target.source) || expanded.size >= providers.length + 30) continue;
    const board = { token: target.board, company: target.board };
    const provider =
      target.kind === "greenhouse"
        ? new GreenhouseJobProvider(board)
        : target.kind === "lever"
          ? new LeverJobProvider(board)
          : new AshbyJobProvider(board);
    expanded.set(target.source, provider);
  }
  await Promise.all(
    [...expanded.values()]
      .filter((provider) =>
        jobs.some((job) => job.source === provider.name || targets.get(job.id)?.source === provider.name),
      )
      .map(async (provider) => {
        try {
          inventories.set(provider.name, new Set((await provider.collect(true)).map((job) => job.externalId)));
        } catch {
          /* A failed or truncated source cannot establish removal. */
        }
      }),
  );
  const checks: Audit["checks"] = [];
  // Bound external link requests; redirects and sign-in walls are inconclusive.
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (index < jobs.length) {
        const job = jobs[index++];
        const target = targets.get(job.id);
        const inventory = inventories.get(target?.source ?? job.source);
        const externalId = target?.externalId ?? job.externalId;
        if (inventory && externalId) {
          const active = inventory.has(externalId);
          checks.push({
            id: job.id,
            state: active ? "available" : "removed",
            reason: active ? "Present in employer job board" : "Removed from employer job board",
          });
          continue;
        }
        if (["linkedin", "indeed", "jsearch"].includes(job.source) && supportedListingPage(job.sourceUrl)) {
          try {
            const response = await request(job.sourceUrl!, {
              method: "GET",
              redirect: "manual",
              signal: AbortSignal.timeout(10000),
            });
            await response.body?.cancel();
            if (response.status === 404 || response.status === 410) {
              checks.push({ id: job.id, state: "removed", reason: `Listing returned HTTP ${response.status}` });
              continue;
            }
          } catch {
            /* Retry during the next audit; never equate access failure with removal. */
          }
          checks.push({
            id: job.id,
            state: "unknown",
            reason: "Job board did not confirm availability; verify in your browser",
          });
        } else {
          checks.push({
            id: job.id,
            state: "unknown",
            reason: "Source unavailable or no longer configured; removal not confirmed",
          });
        }
      }
    }),
  );
  return careerAvailabilitySchema.parse({ checkedAt: now.toISOString(), checks });
}

let pending: Promise<Audit> | undefined;
export function checkCareerAvailability(): Promise<Audit> {
  if (pending) return pending;
  pending = runDailyCheck().finally(() => {
    pending = undefined;
  });
  return pending;
}

async function runDailyCheck(): Promise<Audit> {
  const env = apiEnvironmentSchema.parse(process.env);
  const jobs = await prisma.jobPosting.findMany({
    where: { source: { not: "mock-career" } },
    select: { id: true, source: true, externalId: true, sourceUrl: true },
  });
  const providers: JobProvider[] = [
    ...parseGreenhouseBoards(env.CAREER_GREENHOUSE_BOARDS).map((board) => new GreenhouseJobProvider(board)),
    ...parseGreenhouseBoards(env.CAREER_LEVER_BOARDS).map((board) => new LeverJobProvider(board)),
    ...parseGreenhouseBoards(env.CAREER_ASHBY_BOARDS).map((board) => new AshbyJobProvider(board)),
  ];
  const audit = await auditCareerPostings(jobs, providers);
  const previousRow = await prisma.integrationSnapshot.findUnique({
    where: { integrationKey: CAREER_AVAILABILITY_KEY },
  });
  const previous = careerAvailabilitySchema.safeParse(previousRow?.payload);
  if (previous.success) {
    const closed = new Set(previous.data.checks.filter((check) => check.state === "removed").map((check) => check.id));
    audit.checks = audit.checks.map((check) =>
      check.state === "unknown" && closed.has(check.id)
        ? { ...check, state: "removed", reason: "Previously confirmed removed; latest check was inconclusive" }
        : check,
    );
  }
  const data = { collectedAt: new Date(audit.checkedAt), payload: audit as unknown as Prisma.InputJsonValue };
  await prisma.integrationSnapshot.upsert({
    where: { integrationKey: CAREER_AVAILABILITY_KEY },
    create: { integrationKey: CAREER_AVAILABILITY_KEY, ...data },
    update: data,
  });
  return audit;
}

export function applyCareerAvailability(job: CareerJob, audit?: Audit): CareerJob {
  const check = audit?.checks.find((check) => check.id === job.id);
  if (!audit || !check) return job;
  // A later successful collection or reimport is newer evidence than this audit.
  if (job.source !== "jsearch" && Date.parse(job.lastSeenAt) > Date.parse(audit.checkedAt)) return job;
  return {
    ...job,
    available: check.state === "unknown" ? undefined : check.state === "available",
    availabilityCheckedAt: audit.checkedAt,
    availabilityReason: check.reason,
  };
}
