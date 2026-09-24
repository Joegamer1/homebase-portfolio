import { readSnapshot } from "./snapshot-reader.js";
import { IntegrationState, Prisma, PrismaClient } from "@prisma/client";
import { serviceResponseSchema, serviceSnapshotSchema } from "@homebase/api-contracts";
import { rankAttention } from "@homebase/attention-engine";
import { ServiceCollector, type ServiceCollectorConfig } from "@homebase/collectors";
import { apiEnvironmentSchema } from "@homebase/config";

const globalPrisma = globalThis as typeof globalThis & { homebasePrisma?: PrismaClient };
const prisma = globalPrisma.homebasePrisma ?? new PrismaClient();
globalPrisma.homebasePrisma = prisma;

type Source = "docker" | "uptime-kuma";
function collectorConfig(source: Source): ServiceCollectorConfig | undefined {
  const env = apiEnvironmentSchema.parse(process.env);
  const baseUrl = source === "docker" ? env.DOCKER_PROXY_URL : env.UPTIME_KUMA_BASE_URL;
  if (!baseUrl) return undefined;
  return {
    source,
    baseUrl,
    apiKey: source === "uptime-kuma" ? env.UPTIME_KUMA_API_KEY : undefined,
    expectedDownNames: new Set(
      env.DOCKER_EXPECTED_DOWN_NAMES.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
    restartWarningCount: env.DOCKER_RESTART_WARNING_COUNT,
  };
}

const disabledHealth = () => {
  const checkedAt = new Date().toISOString();
  return {
    state: "disabled" as const,
    checkedAt,
    lastAttemptAt: checkedAt,
    stale: false,
    message: "Service endpoint is not configured",
  };
};

export async function collectService(source: Source) {
  const config = collectorConfig(source);
  if (!config)
    return serviceResponseSchema.parse({ data: { configured: false, health: disabledHealth(), snapshot: null } });

  const integration = await prisma.integration.upsert({
    where: { key: source },
    create: { key: source, name: source, enabled: true, mockMode: false },
    update: { enabled: true, mockMode: false },
  });
  const startedAt = new Date();
  const run = await prisma.collectorRun.create({ data: { integrationId: integration.id, startedAt } });
  const collector = new ServiceCollector(config);
  const started = Date.now();

  try {
    const snapshot = await collector.collect();
    const latencyMs = Date.now() - started;
    const previous = await prisma.integrationSnapshot.findUnique({ where: { integrationKey: source } });
    const previousSnapshot = serviceSnapshotSchema.safeParse(previous?.payload);
    const previousSignals = new Map(
      previousSnapshot.success ? previousSnapshot.data.signals.map((item) => [item.id, item]) : [],
    );
    const signals = rankAttention(snapshot.signals).map((item) => ({
      ...item,
      firstSeen: previousSignals.get(item.id)?.firstSeen ?? item.firstSeen,
      status: previousSignals.get(item.id)?.status ?? item.status,
    }));
    const clientSnapshot = serviceSnapshotSchema.parse({ ...snapshot, signals });
    await prisma.$transaction([
      prisma.integrationSnapshot.upsert({
        where: { integrationKey: source },
        create: {
          integrationKey: source,
          collectedAt: new Date(snapshot.collectedAt),
          payload: clientSnapshot as Prisma.InputJsonValue,
        },
        update: { collectedAt: new Date(snapshot.collectedAt), payload: clientSnapshot as Prisma.InputJsonValue },
      }),
      prisma.integrationHealth.upsert({
        where: { integrationId: integration.id },
        create: {
          integrationId: integration.id,
          state: IntegrationState.HEALTHY,
          lastAttemptAt: new Date(),
          lastSuccessAt: new Date(),
          latencyMs,
        },
        update: {
          state: IntegrationState.HEALTHY,
          lastAttemptAt: new Date(),
          lastSuccessAt: new Date(),
          lastError: null,
          latencyMs,
          consecutiveErrors: 0,
        },
      }),
      prisma.collectorRun.update({
        where: { id: run.id },
        data: {
          completedAt: new Date(),
          success: true,
          itemCount: snapshot.services.length,
        },
      }),
    ]);
    const checkedAt = new Date().toISOString();
    return serviceResponseSchema.parse({
      data: {
        configured: true,
        health: {
          state: "healthy",
          checkedAt,
          lastAttemptAt: checkedAt,
          lastSuccessAt: checkedAt,
          latencyMs,
          stale: false,
          message: "Live service data collected",
        },
        snapshot: clientSnapshot,
      },
    });
  } catch {
    const checkedAt = new Date();
    const latencyMs = Date.now() - started;
    const message = "Service collection failed; check provider connectivity, credentials, and response format";
    const [cached, previousHealth] = await Promise.all([
      prisma.integrationSnapshot.findUnique({ where: { integrationKey: source } }),
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
    const snapshot = cached ? serviceSnapshotSchema.parse({ ...(cached.payload as object), stale: true }) : null;
    return serviceResponseSchema.parse({
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

// Shared by all routes/clients: one collection per interval, including failed attempts.
const pending = new Map<Source, Promise<Awaited<ReturnType<typeof collectService>>>>();
const cached = new Map<Source, { until: number; result: Awaited<ReturnType<typeof collectService>> }>();
export async function getService(source: Source) {
  if (apiEnvironmentSchema.parse(process.env).COLLECTION_MODE === "worker") {
    return serviceResponseSchema.parse({
      data: await readSnapshot(
        source,
        serviceSnapshotSchema,
        apiEnvironmentSchema.parse(process.env).SERVICE_REFRESH_SECONDS,
        Boolean(collectorConfig(source)),
      ),
    });
  }
  const hit = cached.get(source);
  if (hit && hit.until > Date.now()) return hit.result;
  const running = pending.get(source);
  if (running) return running;
  const task = collectService(source)
    .then((result) => {
      cached.set(source, {
        until: Date.now() + apiEnvironmentSchema.parse(process.env).SERVICE_REFRESH_SECONDS * 1000,
        result,
      });
      return result;
    })
    .finally(() => pending.delete(source));
  pending.set(source, task);
  return task;
}
