import { readSnapshot } from "./snapshot-reader.js";
import { IntegrationState, Prisma, PrismaClient, Severity as PrismaSeverity } from "@prisma/client";
import { securityResponseSchema, securitySnapshotSchema, homeSystemSnapshotSchema } from "@homebase/api-contracts";
import { rankAttention } from "@homebase/attention-engine";
import { SecurityCollector } from "@homebase/collectors";
import { apiEnvironmentSchema } from "@homebase/config";
import type { SecuritySnapshot, Severity, TrackedTechnology } from "@homebase/domain";

const globalPrisma = globalThis as typeof globalThis & { homebasePrisma?: PrismaClient };
const prisma = globalPrisma.homebasePrisma ?? new PrismaClient();
globalPrisma.homebasePrisma = prisma;

const severityMap: Record<Severity, PrismaSeverity> = {
  info: PrismaSeverity.INFO,
  low: PrismaSeverity.LOW,
  medium: PrismaSeverity.MEDIUM,
  high: PrismaSeverity.HIGH,
  critical: PrismaSeverity.CRITICAL,
};

function aliases(metadata: Prisma.JsonValue | null): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const value = (metadata as Record<string, unknown>).aliases;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function inventory(): Promise<TrackedTechnology[]> {
  const rows = await prisma.technologyInventory.findMany({ where: { enabled: true }, orderBy: { product: "asc" } });
  const sourceKeys: Record<string, string> = {
    "Plex Media Server": "plex",
    Tailscale: "tailscale",
    "Pi-hole": "pihole",
    "Home Assistant": "home-assistant",
  };
  const snapshots = await prisma.integrationSnapshot.findMany({
    where: { integrationKey: { in: Object.values(sourceKeys) } },
  });
  for (const row of rows) {
    const source = sourceKeys[row.product];
    const record = snapshots.find((snapshot) => snapshot.integrationKey === source);
    const parsed = homeSystemSnapshotSchema.safeParse(record?.payload);
    if (
      !record ||
      Date.now() - record.collectedAt.getTime() > 15 * 60_000 ||
      !parsed.success ||
      parsed.data.stale ||
      !parsed.data.version
    )
      continue;
    const version = parsed.data.version;
    if (!/^[0-9][a-zA-Z0-9._+-]{0,99}$/.test(version)) continue;
    await prisma.technologyInventory.update({
      where: { id: row.id },
      data: { version, source: `collector:${source}`, detectedAt: record.collectedAt, confidence: 95 },
    });
    row.version = version;
    row.source = `collector:${source}`;
    row.confidence = 95;
  }
  return rows.map((row) => ({
    id: row.id,
    product: row.product,
    vendor: row.vendor ?? undefined,
    version: row.version ?? undefined,
    source: row.source,
    confidence: row.confidence,
    enabled: row.enabled,
    aliases: aliases(row.metadata),
  }));
}

export async function collectSecurity() {
  const env = apiEnvironmentSchema.parse(process.env);
  const technologies = await inventory();
  const integration = await prisma.integration.upsert({
    where: { key: "security-intelligence" },
    create: { key: "security-intelligence", name: "Security Intelligence", enabled: true, mockMode: false },
    update: { name: "Security Intelligence", enabled: true, mockMode: false },
  });
  const startedAt = new Date();
  const run = await prisma.collectorRun.create({ data: { integrationId: integration.id, startedAt } });
  const started = Date.now();
  const collector = new SecurityCollector({
    cisaKevUrl: env.CISA_KEV_URL,
    nvdCveUrl: env.NVD_CVE_URL,
    nvdApiKey: env.NVD_API_KEY,
    lookbackDays: env.SECURITY_LOOKBACK_DAYS,
    maxAdvisories: env.SECURITY_MAX_ADVISORIES,
    technologies,
    feedStore: {
      read: async (integrationKey) =>
        (await prisma.integrationSnapshot.findUnique({ where: { integrationKey } }))?.payload,
      write: async (integrationKey, value) => {
        const data = { collectedAt: new Date(value.collectedAt), payload: value as unknown as Prisma.InputJsonValue };
        await prisma.integrationSnapshot.upsert({
          where: { integrationKey },
          create: { integrationKey, ...data },
          update: data,
        });
      },
    },
  });

  try {
    const snapshot = await collector.collect();
    const latencyMs = Date.now() - started;
    const previous = await prisma.integrationSnapshot.findUnique({
      where: { integrationKey: "security-intelligence" },
    });
    const parsedPrevious = securitySnapshotSchema.safeParse(previous?.payload);
    const previousSignals = new Map(
      parsedPrevious.success ? parsedPrevious.data.signals.map((signal) => [signal.id, signal]) : [],
    );
    const signals = rankAttention(snapshot.signals).map((signal) => ({
      ...signal,
      firstSeen: previousSignals.get(signal.id)?.firstSeen ?? signal.firstSeen,
      status: previousSignals.get(signal.id)?.status ?? signal.status,
    }));
    const clientSnapshot = securitySnapshotSchema.parse({ ...snapshot, signals });
    const partial = snapshot.feeds.some((feed) => feed.state === "down");
    const anySuccess = snapshot.feeds.some((feed) => feed.state === "healthy");
    const lastSuccess = snapshot.feeds
      .map((feed) => feed.lastSuccessAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    const completedAt = new Date();
    await prisma.$transaction([
      ...snapshot.advisories.map((advisory) =>
        prisma.securityAdvisory.upsert({
          where: { source_externalId: { source: "security-intelligence", externalId: advisory.cveId } },
          create: {
            source: "security-intelligence",
            externalId: advisory.cveId,
            title: advisory.title,
            summary: advisory.summary,
            severity: severityMap[advisory.severity],
            publishedAt: advisory.publishedAt ? new Date(advisory.publishedAt) : undefined,
            modifiedAt: advisory.updatedAt ? new Date(advisory.updatedAt) : undefined,
            sourceUrl: advisory.sourceUrl,
            knownExploited: advisory.knownExploited,
            metadata: advisory as unknown as Prisma.InputJsonValue,
          },
          update: {
            title: advisory.title,
            summary: advisory.summary,
            severity: severityMap[advisory.severity],
            publishedAt: advisory.publishedAt ? new Date(advisory.publishedAt) : null,
            modifiedAt: advisory.updatedAt ? new Date(advisory.updatedAt) : null,
            sourceUrl: advisory.sourceUrl,
            knownExploited: advisory.knownExploited,
            metadata: advisory as unknown as Prisma.InputJsonValue,
          },
        }),
      ),
      prisma.integrationSnapshot.upsert({
        where: { integrationKey: "security-intelligence" },
        create: {
          integrationKey: "security-intelligence",
          collectedAt: new Date(snapshot.collectedAt),
          payload: clientSnapshot as Prisma.InputJsonValue,
        },
        update: {
          collectedAt: new Date(snapshot.collectedAt),
          payload: clientSnapshot as Prisma.InputJsonValue,
        },
      }),
      prisma.integrationHealth.upsert({
        where: { integrationId: integration.id },
        create: {
          integrationId: integration.id,
          state: partial ? IntegrationState.DEGRADED : IntegrationState.HEALTHY,
          lastAttemptAt: completedAt,
          lastSuccessAt: lastSuccess ? new Date(lastSuccess) : undefined,
          latencyMs,
        },
        update: {
          state: partial ? IntegrationState.DEGRADED : IntegrationState.HEALTHY,
          lastAttemptAt: completedAt,
          lastSuccessAt: lastSuccess ? new Date(lastSuccess) : undefined,
          lastError: partial ? "One authoritative feed is unavailable" : null,
          latencyMs,
          consecutiveErrors: partial ? { increment: 1 } : 0,
        },
      }),
      prisma.collectorRun.update({
        where: { id: run.id },
        data: {
          completedAt,
          success: anySuccess,
          itemCount: snapshot.advisories.length,
          error: partial ? "One authoritative feed is unavailable" : null,
        },
      }),
    ]);
    const checkedAt = completedAt.toISOString();
    return securityResponseSchema.parse({
      data: {
        configured: true,
        health: {
          state: partial ? "degraded" : "healthy",
          checkedAt,
          lastAttemptAt: checkedAt,
          lastSuccessAt: lastSuccess,
          latencyMs,
          stale: snapshot.stale,
          message: partial ? "Partial authoritative security data collected" : "Authoritative security data collected",
        },
        snapshot: clientSnapshot,
      },
    });
  } catch {
    const checkedAt = new Date();
    const latencyMs = Date.now() - started;
    const message = "Security collection failed; serving the last successful snapshot when available";
    const [cached, previousHealth] = await Promise.all([
      prisma.integrationSnapshot.findUnique({ where: { integrationKey: "security-intelligence" } }),
      prisma.integrationHealth.findUnique({ where: { integrationId: integration.id } }),
    ]);
    await prisma.$transaction([
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
    const snapshot: SecuritySnapshot | null = cached
      ? securitySnapshotSchema.parse({ ...(cached.payload as object), stale: true })
      : null;
    return securityResponseSchema.parse({
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
        snapshot,
      },
    });
  }
}

let pending: Promise<Awaited<ReturnType<typeof collectSecurity>>> | undefined;
let cached: { until: number; result: Awaited<ReturnType<typeof collectSecurity>> } | undefined;

export async function getSecurity() {
  if (apiEnvironmentSchema.parse(process.env).COLLECTION_MODE === "worker") {
    return securityResponseSchema.parse({
      data: await readSnapshot(
        "security-intelligence",
        securitySnapshotSchema,
        apiEnvironmentSchema.parse(process.env).SECURITY_REFRESH_SECONDS,
      ),
    });
  }
  if (cached && cached.until > Date.now()) return cached.result;
  if (pending) return pending;
  pending = collectSecurity()
    .then((result) => {
      cached = {
        until: Date.now() + apiEnvironmentSchema.parse(process.env).SECURITY_REFRESH_SECONDS * 1000,
        result,
      };
      return result;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
