import { createDailyCareerSearch, deduplicateCareerJobs, listingIdentity } from "./career-search.js";
import { enrichCareerSalaries } from "./career-salary.js";
import { applyCareerAvailability, CAREER_AVAILABILITY_KEY } from "./career-availability.js";
import { readSnapshot } from "./snapshot-reader.js";
import { IntegrationState, Prisma, PrismaClient } from "@prisma/client";
import {
  careerAvailabilitySchema,
  careerImportSchema,
  careerImportResponseSchema,
  careerResponseSchema,
  careerSnapshotSchema,
  jobStatusResponseSchema,
  jobStatusSchema,
} from "@homebase/api-contracts";
import { rankAttention } from "@homebase/attention-engine";
import {
  compareCareerJobs,
  defaultCareerProfile,
  isEligibleCareerJob,
  legacyCareerTargetTitles,
  normalizeCareerJob,
} from "@homebase/career-engine";
import {
  AshbyJobProvider,
  LeverJobProvider,
  GreenhouseJobProvider,
  MockJobProvider,
  parseGreenhouseBoards,
  inferArrangement,
  isRelevantTitle,
} from "@homebase/collectors";
import { apiEnvironmentSchema } from "@homebase/config";
import type {
  CareerJob,
  CareerJobDraft,
  CareerProfile,
  CareerSnapshot,
  JobProvider,
  RawAttentionSignal,
} from "@homebase/domain";

const globalPrisma = globalThis as typeof globalThis & { homebasePrisma?: PrismaClient };
const prisma = globalPrisma.homebasePrisma ?? new PrismaClient();
globalPrisma.homebasePrisma = prisma;

const strings = (value: Prisma.JsonValue): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

async function profile(): Promise<CareerProfile> {
  let row = await prisma.careerProfile.upsert({
    where: { id: defaultCareerProfile.id },
    create: defaultCareerProfile,
    update: {},
  });
  const existingTitles = strings(row.targetTitles);
  if (
    existingTitles.length === legacyCareerTargetTitles.length &&
    existingTitles.every((title, index) => title === legacyCareerTargetTitles[index])
  ) {
    row = await prisma.careerProfile.update({
      where: { id: row.id },
      data: {
        targetTitles: defaultCareerProfile.targetTitles,
        advancementTerms: defaultCareerProfile.advancementTerms,
      },
    });
  }
  const missingCloudTitles = defaultCareerProfile.targetTitles.filter(
    (title) =>
      /cloud|devsecops|iam engineer|aws security|azure security/i.test(title) &&
      !strings(row.targetTitles).includes(title),
  );
  if (missingCloudTitles.length) {
    row = await prisma.careerProfile.update({
      where: { id: row.id },
      data: { targetTitles: [...strings(row.targetTitles), ...missingCloudTitles] },
    });
  }
  const cloudSkills = [
    "AWS",
    "Azure",
    "IAM",
    "Entra ID",
    "Terraform",
    "Docker",
    "CloudTrail",
    "GuardDuty",
    "Vulnerability Management",
    "Security Monitoring",
    "Networking",
    "Git",
    "CI/CD",
  ];
  const missingCloudSkills = cloudSkills.filter((skill) => !strings(row.targetSkills).includes(skill));
  if (missingCloudSkills.length) {
    row = await prisma.careerProfile.update({
      where: { id: row.id },
      data: { targetSkills: [...strings(row.targetSkills), ...missingCloudSkills] },
    });
  }
  return {
    ...row,
    locations: strings(row.locations),
    targetTitles: strings(row.targetTitles),
    targetSkills: strings(row.targetSkills),
    advancementTerms: strings(row.advancementTerms),
    regressionTerms: strings(row.regressionTerms),
  };
}

function attention(job: CareerJob, observedAt: string): RawAttentionSignal | undefined {
  if (
    job.stale ||
    job.available === false ||
    job.source === "mock-career" ||
    job.status !== "new" ||
    job.matchScore < 75 ||
    job.careerValueScore < 70
  )
    return undefined;
  return {
    id: `career:${job.source}:${job.externalId}`,
    domain: "career",
    title: `${job.title} at ${job.company}`,
    summary: `${job.matchScore}% match · ${job.careerValueScore}% career value · ${job.reasons.slice(0, 2).join(" · ")}`,
    severity: job.careerValueScore >= 85 ? "high" : "medium",
    urgency: job.postedAt && Date.now() - new Date(job.postedAt).getTime() <= 3 * 86_400_000 ? 82 : 62,
    relevance: job.matchScore,
    consequence: job.careerValueScore,
    recency: 90,
    confidence: job.source.startsWith("greenhouse:") ? 88 : 70,
    source: job.source,
    sourceUrl: job.sourceUrl,
    entity: `${job.company}:${job.externalId}`,
    observedAt,
    action: { label: "Review match", href: "/career" },
  };
}

function trends(jobs: CareerJob[], now: Date) {
  const counts = new Map<string, { currentWeek: number; previousWeek: number }>();
  for (const job of jobs) {
    const date = job.postedAt ? new Date(job.postedAt) : new Date(job.firstSeenAt);
    const age = (now.getTime() - date.getTime()) / 86_400_000;
    if (age < 0 || age > 14) continue;
    for (const skill of new Set([...job.requiredSkills, ...job.preferredSkills])) {
      const count = counts.get(skill) ?? { currentWeek: 0, previousWeek: 0 };
      if (age <= 7) count.currentWeek += 1;
      else count.previousWeek += 1;
      counts.set(skill, count);
    }
  }
  return [...counts.entries()]
    .map(([skill, count]) => ({ skill, ...count, delta: count.currentWeek - count.previousWeek }))
    .sort((a, b) => b.currentWeek - a.currentWeek || b.delta - a.delta || a.skill.localeCompare(b.skill))
    .slice(0, 12);
}

async function persist(jobs: CareerJob[]) {
  const stored: CareerJob[] = [];
  for (const job of jobs) {
    const row = await prisma.jobPosting.upsert({
      where: { source_externalId: { source: job.source, externalId: job.externalId } },
      create: {
        externalId: job.externalId,
        title: job.title,
        company: job.company,
        location: job.location,
        arrangement: job.arrangement,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        source: job.source,
        sourceUrl: job.sourceUrl,
        postedAt: job.postedAt ? new Date(job.postedAt) : undefined,
        summary: job.description.slice(0, 400),
        description: job.description,
        firstSeenAt: new Date(job.firstSeenAt),
        lastSeenAt: new Date(job.lastSeenAt),
        matchScore: job.matchScore,
        careerValueScore: job.careerValueScore,
        reasons: job.reasons,
        gaps: job.gaps,
        status: job.status.toUpperCase(),
        skills: {
          create: [
            ...job.requiredSkills.map((name) => ({ name, required: true })),
            ...job.preferredSkills.map((name) => ({ name, required: false })),
          ],
        },
      },
      update: {
        title: job.title,
        company: job.company,
        location: job.location,
        arrangement: job.arrangement,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        sourceUrl: job.sourceUrl,
        postedAt: job.postedAt ? new Date(job.postedAt) : null,
        summary: job.description.slice(0, 400),
        description: job.description,
        lastSeenAt: new Date(job.lastSeenAt),
        matchScore: job.matchScore,
        careerValueScore: job.careerValueScore,
        reasons: job.reasons,
        gaps: job.gaps,
        skills: {
          deleteMany: {},
          create: [
            ...job.requiredSkills.map((name) => ({ name, required: true })),
            ...job.preferredSkills.map((name) => ({ name, required: false })),
          ],
        },
      },
    });
    stored.push({
      ...job,
      id: row.id,
      firstSeenAt: row.firstSeenAt.toISOString(),
      status: jobStatusSchema.parse(row.status.toLowerCase()),
    });
  }
  return stored;
}

export async function collectCareer() {
  const env = apiEnvironmentSchema.parse(process.env);
  const careerProfile = await profile();
  const providers: JobProvider[] = [
    ...(env.CAREER_JSEARCH_API_KEY ? [createDailyCareerSearch(prisma, careerProfile, env.CAREER_JSEARCH_API_KEY)] : []),
    ...(env.CAREER_MOCK_ENABLED ? [new MockJobProvider()] : []),
    ...parseGreenhouseBoards(env.CAREER_GREENHOUSE_BOARDS).map((board) => new GreenhouseJobProvider(board)),
    ...parseGreenhouseBoards(env.CAREER_LEVER_BOARDS).map((board) => new LeverJobProvider(board)),
    ...parseGreenhouseBoards(env.CAREER_ASHBY_BOARDS).map((board) => new AshbyJobProvider(board)),
  ];
  const integration = await prisma.integration.upsert({
    where: { key: "career-radar" },
    create: { key: "career-radar", name: "Career Radar", enabled: true, mockMode: env.CAREER_MOCK_ENABLED },
    update: { name: "Career Radar", enabled: true, mockMode: env.CAREER_MOCK_ENABLED },
  });
  const startedAt = new Date();
  const run = await prisma.collectorRun.create({ data: { integrationId: integration.id, startedAt } });
  const started = Date.now();
  try {
    const results = await Promise.allSettled(providers.map((provider) => provider.collect()));
    if (!results.some((result) => result.status === "fulfilled")) throw new Error("All career providers failed");
    const collectedAt = new Date().toISOString();
    const previousSources = await Promise.all(
      providers.map(async (provider) => {
        const row = await prisma.integrationSnapshot.findUnique({
          where: { integrationKey: `career-source:${provider.name}` },
        });
        const parsed = careerSnapshotSchema.shape.jobs.safeParse(
          (row?.payload as { jobs?: unknown } | undefined)?.jobs,
        );
        return parsed.success ? parsed.data : [];
      }),
    );
    const providerStates: CareerSnapshot["providers"] = providers.map((provider, index) => {
      const result = results[index]!;
      return result.status === "fulfilled"
        ? {
            source: provider.name,
            state: "healthy" as const,
            itemCount: result.value.length,
            eligibleCount: result.value.filter(isEligibleCareerJob).length,
            message: provider.collectedAt ? `Last searched ${provider.collectedAt}` : undefined,
          }
        : {
            source: provider.name,
            state: "down" as const,
            itemCount: previousSources[index].length,
            message: "Provider collection failed; retained postings are stale",
          };
    });
    if (!env.CAREER_JSEARCH_API_KEY)
      providerStates.push({
        source: "jsearch",
        state: "disabled",
        itemCount: 0,
        message: "Free account connection needed",
      });
    const collectedDrafts = results
      .flatMap<
        CareerJobDraft & { stale: boolean; available?: boolean }
      >((result, index) => (result.status === "fulfilled" ? result.value.map((job) => ({ ...job, stale: false, available: true })) : previousSources[index].map((job) => ({ ...job, stale: true }))))
      .filter((job) => isEligibleCareerJob(job) && isRelevantTitle(job.title));
    const salaryEnrichedDrafts = env.CAREER_JSEARCH_API_KEY
      ? await enrichCareerSalaries(prisma, env.CAREER_JSEARCH_API_KEY, careerProfile, collectedDrafts)
      : collectedDrafts;
    const selectedListings = new Set<string>();
    const drafts = salaryEnrichedDrafts
      .map((draft) =>
        normalizeCareerJob(
          draft,
          careerProfile,
          (draft.source === "jsearch" && "lastSeenAt" in draft && typeof draft.lastSeenAt === "string"
            ? draft.lastSeenAt
            : undefined) ??
            providers.find((provider) => provider.name === draft.source)?.collectedAt ??
            collectedAt,
        ),
      )
      .sort(compareCareerJobs)
      .filter((job) => {
        const key = listingIdentity(job);
        if (selectedListings.has(key)) return true;
        if (selectedListings.size >= env.CAREER_MAX_JOBS) return false;
        selectedListings.add(key);
        return true;
      });
    const fresh = await persist(drafts.filter((job) => !job.stale));
    const jobs = [
      ...fresh,
      ...drafts
        .filter((job) => job.stale)
        .map((job) => {
          const old = previousSources
            .flat()
            .find((item) => item.source === job.source && item.externalId === job.externalId)!;
          return { ...old, stale: true };
        }),
    ].sort(compareCareerJobs);
    const signals = rankAttention(jobs.flatMap((job) => attention(job, collectedAt) ?? []));
    const clientSnapshot = careerSnapshotSchema.parse({
      source: "career-radar",
      collectedAt,
      stale: jobs.some((job) => job.stale),
      profile: careerProfile,
      providers: providerStates,
      jobs,
      skillTrends: trends(jobs, new Date(collectedAt)),
      signals,
    });
    const partial = providerStates.some((provider) => provider.state === "down");
    const completedAt = new Date();
    const latencyMs = Date.now() - started;
    await prisma.$transaction([
      ...providers.flatMap((provider, index) =>
        results[index].status === "fulfilled"
          ? [
              prisma.integrationSnapshot.upsert({
                where: { integrationKey: `career-source:${provider.name}` },
                create: {
                  integrationKey: `career-source:${provider.name}`,
                  collectedAt: new Date(collectedAt),
                  payload: {
                    jobs: fresh.filter((job) => job.source === provider.name),
                  } as unknown as Prisma.InputJsonValue,
                },
                update: {
                  collectedAt: new Date(collectedAt),
                  payload: {
                    jobs: fresh.filter((job) => job.source === provider.name),
                  } as unknown as Prisma.InputJsonValue,
                },
              }),
            ]
          : [],
      ),
      prisma.integrationSnapshot.upsert({
        where: { integrationKey: "career-radar" },
        create: {
          integrationKey: "career-radar",
          collectedAt: new Date(collectedAt),
          payload: clientSnapshot as Prisma.InputJsonValue,
        },
        update: { collectedAt: new Date(collectedAt), payload: clientSnapshot as Prisma.InputJsonValue },
      }),
      prisma.integrationHealth.upsert({
        where: { integrationId: integration.id },
        create: {
          integrationId: integration.id,
          state: partial ? IntegrationState.DEGRADED : IntegrationState.HEALTHY,
          lastAttemptAt: completedAt,
          lastSuccessAt: completedAt,
          latencyMs,
        },
        update: {
          state: partial ? IntegrationState.DEGRADED : IntegrationState.HEALTHY,
          lastAttemptAt: completedAt,
          lastSuccessAt: completedAt,
          lastError: partial ? "One or more career providers are unavailable" : null,
          latencyMs,
          consecutiveErrors: partial ? { increment: 1 } : 0,
        },
      }),
      prisma.collectorRun.update({
        where: { id: run.id },
        data: {
          completedAt,
          success: true,
          itemCount: jobs.length,
          error: partial ? "One or more career providers are unavailable" : null,
        },
      }),
    ]);
    return careerResponseSchema.parse({
      data: {
        configured: true,
        health: {
          state: partial ? "degraded" : "healthy",
          checkedAt: completedAt.toISOString(),
          lastAttemptAt: completedAt.toISOString(),
          lastSuccessAt: completedAt.toISOString(),
          latencyMs,
          stale: clientSnapshot.stale,
          message: partial ? "Career data collected with some providers unavailable" : "Career data collected",
        },
        snapshot: clientSnapshot,
      },
    });
  } catch (error) {
    console.error("Career Radar collection failed", error instanceof Error ? error.message : "unknown error");
    const checkedAt = new Date();
    const latencyMs = Date.now() - started;
    const message = "Career collection failed; serving the last successful snapshot when available";
    const [snapshotRow, previousHealth] = await Promise.all([
      prisma.integrationSnapshot.findUnique({ where: { integrationKey: "career-radar" } }),
      prisma.integrationHealth.findUnique({ where: { integrationId: integration.id } }),
    ]);
    const previousSnapshot = snapshotRow ? careerSnapshotSchema.parse(snapshotRow.payload) : null;
    const cached: CareerSnapshot | null = previousSnapshot
      ? careerSnapshotSchema.parse({
          ...previousSnapshot,
          stale: true,
          providers: previousSnapshot.providers.map((provider) => ({
            ...provider,
            state: "down",
            message: "Provider collection failed; retained postings are stale",
          })),
          jobs: previousSnapshot.jobs.map((job) => ({ ...job, stale: true })),
        })
      : null;
    await prisma.$transaction([
      ...(cached
        ? [
            prisma.integrationSnapshot.update({
              where: { integrationKey: "career-radar" },
              data: { payload: cached as unknown as Prisma.InputJsonValue },
            }),
          ]
        : []),
      prisma.integrationHealth.upsert({
        where: { integrationId: integration.id },
        create: {
          integrationId: integration.id,
          state: cached ? IntegrationState.DEGRADED : IntegrationState.DOWN,
          lastAttemptAt: checkedAt,
          lastError: message,
          latencyMs,
          consecutiveErrors: 1,
        },
        update: {
          state: cached ? IntegrationState.DEGRADED : IntegrationState.DOWN,
          lastAttemptAt: checkedAt,
          lastError: message,
          latencyMs,
          consecutiveErrors: { increment: 1 },
        },
      }),
      prisma.collectorRun.update({
        where: { id: run.id },
        data: { completedAt: checkedAt, success: false, error: message },
      }),
    ]);
    return careerResponseSchema.parse({
      data: {
        configured: true,
        health: {
          state: cached ? "degraded" : "down",
          checkedAt: checkedAt.toISOString(),
          lastAttemptAt: checkedAt.toISOString(),
          lastSuccessAt: previousHealth?.lastSuccessAt?.toISOString(),
          lastError: message,
          latencyMs,
          stale: Boolean(cached),
          message,
        },
        snapshot: cached,
      },
    });
  }
}

let pending: Promise<Awaited<ReturnType<typeof collectCareer>>> | undefined;
let cached: { until: number; result: Awaited<ReturnType<typeof collectCareer>> } | undefined;

async function getCollectedCareer() {
  if (apiEnvironmentSchema.parse(process.env).COLLECTION_MODE === "worker") {
    return careerResponseSchema.parse({
      data: await readSnapshot(
        "career-radar",
        careerSnapshotSchema,
        apiEnvironmentSchema.parse(process.env).CAREER_REFRESH_SECONDS,
      ),
    });
  }
  if (cached && cached.until > Date.now()) return cached.result;
  if (pending) return pending;
  pending = collectCareer()
    .then((result) => {
      cached = { until: Date.now() + apiEnvironmentSchema.parse(process.env).CAREER_REFRESH_SECONDS * 1000, result };
      return result;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

// Status lives in JobPosting, not in an immutable collection snapshot. Overlay on every
// read so restarts, provider failures, and concurrent collection cannot resurrect alerts.
export async function getCareer() {
  const result = await getCollectedCareer();
  let snapshot = result.data.snapshot;
  const availabilityRow = await prisma.integrationSnapshot.findUnique({
    where: { integrationKey: CAREER_AVAILABILITY_KEY },
  });
  const availability = careerAvailabilitySchema.safeParse(availabilityRow?.payload);
  const removedIds = availability.success
    ? availability.data.checks.filter((check) => check.state === "removed").map((check) => check.id)
    : [];
  const rows = await prisma.jobPosting.findMany({
    where: {
      OR: [
        { id: { in: (snapshot?.jobs ?? []).map((job) => job.id) } },
        { status: { in: ["SAVED", "APPLIED", "DISMISSED"] } },
        { source: { in: ["linkedin", "indeed"] } },
        { id: { in: removedIds } },
      ],
    },
  });
  if (!snapshot) {
    if (!rows.length) return result;
    snapshot = careerSnapshotSchema.parse({
      source: "career-radar",
      collectedAt: new Date().toISOString(),
      stale: true,
      profile: await profile(),
      providers: [],
      jobs: [],
      skillTrends: [],
      signals: [],
    });
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const jobs = new Map<string, CareerJob>(
    snapshot.jobs.filter(isEligibleCareerJob).map((job) => [
      job.id,
      {
        ...job,
        stale:
          job.stale || (result.data.health.stale && !snapshot.providers.some((provider) => provider.state === "down")),
        status: byId.has(job.id) ? jobStatusSchema.parse(byId.get(job.id)!.status.toLowerCase()) : job.status,
      },
    ]),
  );
  for (const row of rows) {
    if (
      jobs.has(row.id) ||
      (row.status === "NEW" && row.source !== "linkedin" && row.source !== "indeed" && !removedIds.includes(row.id)) ||
      !row.externalId
    )
      continue;
    const job = normalizeCareerJob(
      {
        externalId: row.externalId,
        title: row.title,
        company: row.company,
        location: row.location ?? "",
        arrangement: careerSnapshotSchema.shape.jobs.element.shape.arrangement.parse(row.arrangement ?? "unknown"),
        description: row.description ?? row.summary ?? "",
        source: row.source,
        sourceUrl: row.sourceUrl ?? undefined,
        employmentType: row.employmentType ?? undefined,
        salaryMin: row.salaryMin ?? undefined,
        salaryMax: row.salaryMax ?? undefined,
        salaryCurrency: row.salaryCurrency ?? undefined,
        postedAt: row.postedAt?.toISOString(),
      },
      snapshot.profile,
      row.lastSeenAt.toISOString(),
    );
    if (isEligibleCareerJob(job))
      jobs.set(row.id, {
        ...job,
        id: row.id,
        available: undefined,
        firstSeenAt: row.firstSeenAt.toISOString(),
        status: jobStatusSchema.parse(row.status.toLowerCase()),
      });
  }
  const mockEnabled = apiEnvironmentSchema.parse(process.env).CAREER_MOCK_ENABLED;
  const visible = deduplicateCareerJobs(
    [...jobs.values()]
      .map((job) => applyCareerAvailability(job, availability.success ? availability.data : undefined))
      .filter((job) => mockEnabled || job.source !== "mock-career"),
  ).sort(compareCareerJobs);
  return careerResponseSchema.parse({
    data: {
      ...result.data,
      snapshot: {
        ...snapshot,
        availabilityCheckedAt: availability.success ? availability.data.checkedAt : undefined,
        jobs: visible,
        skillTrends: trends(visible, new Date(snapshot.collectedAt)),
        signals: rankAttention(visible.flatMap((job) => attention(job, snapshot.collectedAt) ?? [])),
      },
    },
  });
}

export async function updateCareerJobStatus(id: string, value: unknown) {
  const status = jobStatusSchema.parse(value);
  const row = await prisma.jobPosting.update({ where: { id }, data: { status: status.toUpperCase() } });
  return jobStatusResponseSchema.parse({ data: { id: row.id, status } });
}

export async function importCareerJob(value: unknown) {
  const input = careerImportSchema.parse(value);
  const url = new URL(input.sourceUrl);
  const source = url.hostname.endsWith("linkedin.com") ? "linkedin" : "indeed";
  const externalId = source === "linkedin" ? url.pathname.match(/([0-9]+)\/?$/)![1] : url.searchParams.get("jk")!;
  const sourceUrl =
    source === "linkedin"
      ? `https://www.linkedin.com/jobs/view/${externalId}/`
      : `https://www.indeed.com/viewjob?jk=${externalId}`;
  const job = normalizeCareerJob(
    {
      ...input,
      arrangement:
        input.arrangement === "remote"
          ? inferArrangement(`Remote · ${input.location}`, input.description)
          : input.arrangement,
      source,
      externalId,
      sourceUrl,
    },
    await profile(),
  );
  if (!isEligibleCareerJob(job))
    throw new Error("Only Ohio or explicitly US remote roles eligible for Ohio are included.");
  // Save imports so collection refreshes cannot remove them. Reimports preserve status.
  const [stored] = await persist([{ ...job, status: "saved" }]);
  return careerImportResponseSchema.parse({ data: stored });
}
