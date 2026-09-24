import { readSnapshot } from "./snapshot-reader.js";
import { IntegrationState, Prisma, PrismaClient } from "@prisma/client";
import { homeSystemResponseSchema, homeSystemSnapshotSchema } from "@homebase/api-contracts";
import { rankAttention } from "@homebase/attention-engine";
import { HomeSystemCollector, type HomeSystemCollectorConfig } from "@homebase/collectors";
import { apiEnvironmentSchema, type ApiEnvironment } from "@homebase/config";
import type { HomeSystemSource } from "@homebase/domain";

const globalPrisma = globalThis as typeof globalThis & { homebasePrisma?: PrismaClient };
const prisma = globalPrisma.homebasePrisma ?? new PrismaClient();
globalPrisma.homebasePrisma = prisma;

const names: Record<HomeSystemSource, string> = {
  pihole: "Pi-hole",
  plex: "Plex",
  "home-assistant": "Home Assistant",
  tailscale: "Tailscale",
};

export function refreshSecondsFor(source: HomeSystemSource, env: ApiEnvironment): number {
  return source === "plex" ? env.PLEX_REFRESH_SECONDS : env.HOME_SYSTEM_REFRESH_SECONDS;
}

function collectorConfig(source: HomeSystemSource): HomeSystemCollectorConfig | undefined {
  const env = apiEnvironmentSchema.parse(process.env);
  const values: Record<HomeSystemSource, { baseUrl?: string; credential?: string }> = {
    pihole: { baseUrl: env.PIHOLE_BASE_URL, credential: env.PIHOLE_APP_PASSWORD },
    plex: { baseUrl: env.PLEX_BASE_URL, credential: env.PLEX_TOKEN },
    "home-assistant": { baseUrl: env.HOME_ASSISTANT_BASE_URL, credential: env.HOME_ASSISTANT_TOKEN },
    tailscale: { baseUrl: env.TAILSCALE_STATUS_URL },
  };
  const value = values[source];
  if (!value.baseUrl || (source !== "tailscale" && !value.credential)) return undefined;
  return { source, baseUrl: value.baseUrl, credential: value.credential };
}

function disabled(message: string) {
  const checkedAt = new Date().toISOString();
  return { state: "disabled" as const, checkedAt, lastAttemptAt: checkedAt, stale: false, message };
}

export async function collectHomeSystem(source: HomeSystemSource) {
  const config = collectorConfig(source);
  if (!config)
    return homeSystemResponseSchema.parse({
      data: { configured: false, health: disabled(`${names[source]} is not configured`), snapshot: null },
    });

  const integration = await prisma.integration.upsert({
    where: { key: source },
    create: { key: source, name: names[source], enabled: true, mockMode: false },
    update: { name: names[source], enabled: true, mockMode: false },
  });
  const startedAt = new Date();
  const run = await prisma.collectorRun.create({ data: { integrationId: integration.id, startedAt } });
  const collector = new HomeSystemCollector(config);
  const started = Date.now();

  try {
    const snapshot = await collector.collect();
    const latencyMs = Date.now() - started;
    const previous = await prisma.integrationSnapshot.findUnique({ where: { integrationKey: source } });
    const previousSnapshot = homeSystemSnapshotSchema.safeParse(previous?.payload);
    const previousSignals = new Map(
      previousSnapshot.success ? previousSnapshot.data.signals.map((item) => [item.id, item]) : [],
    );
    const signals = rankAttention(snapshot.signals).map((item) => ({
      ...item,
      firstSeen: previousSignals.get(item.id)?.firstSeen ?? item.firstSeen,
      status: previousSignals.get(item.id)?.status ?? item.status,
    }));
    const clientSnapshot = homeSystemSnapshotSchema.parse({ ...snapshot, signals });
    const completedAt = new Date();
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
          lastAttemptAt: completedAt,
          lastSuccessAt: completedAt,
          latencyMs,
        },
        update: {
          state: IntegrationState.HEALTHY,
          lastAttemptAt: completedAt,
          lastSuccessAt: completedAt,
          lastError: null,
          latencyMs,
          consecutiveErrors: 0,
        },
      }),
      prisma.collectorRun.update({
        where: { id: run.id },
        data: { completedAt, success: true, itemCount: snapshot.metrics.length + snapshot.entities.length },
      }),
    ]);
    const checkedAt = completedAt.toISOString();
    return homeSystemResponseSchema.parse({
      data: {
        configured: true,
        health: {
          state: "healthy",
          checkedAt,
          lastAttemptAt: checkedAt,
          lastSuccessAt: checkedAt,
          latencyMs,
          stale: false,
          message: `Live ${names[source]} data collected`,
        },
        snapshot: clientSnapshot,
      },
    });
  } catch {
    const checkedAt = new Date();
    const latencyMs = Date.now() - started;
    const message = `${names[source]} collection failed; check connectivity, credentials, and response format`;
    const [cachedSnapshot, previousHealth] = await Promise.all([
      prisma.integrationSnapshot.findUnique({ where: { integrationKey: source } }),
      prisma.integrationHealth.findUnique({ where: { integrationId: integration.id } }),
    ]);
    await prisma.$transaction([
      prisma.integrationHealth.upsert({
        where: { integrationId: integration.id },
        create: {
          integrationId: integration.id,
          state: cachedSnapshot ? IntegrationState.DEGRADED : IntegrationState.DOWN,
          lastAttemptAt: checkedAt,
          lastError: message,
          latencyMs,
          consecutiveErrors: 1,
        },
        update: {
          state: cachedSnapshot ? IntegrationState.DEGRADED : IntegrationState.DOWN,
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
    const snapshot = cachedSnapshot
      ? homeSystemSnapshotSchema.parse({ ...(cachedSnapshot.payload as object), stale: true })
      : null;
    return homeSystemResponseSchema.parse({
      data: {
        configured: true,
        health: {
          state: cachedSnapshot ? "degraded" : "down",
          checkedAt: checkedAt.toISOString(),
          lastAttemptAt: checkedAt.toISOString(),
          lastSuccessAt: previousHealth?.lastSuccessAt?.toISOString(),
          lastError: message,
          latencyMs,
          stale: Boolean(cachedSnapshot),
          message,
        },
        snapshot,
      },
    });
  }
}

const pending = new Map<HomeSystemSource, Promise<Awaited<ReturnType<typeof collectHomeSystem>>>>();
const cached = new Map<HomeSystemSource, { until: number; result: Awaited<ReturnType<typeof collectHomeSystem>> }>();

export async function getHomeSystem(source: HomeSystemSource) {
  const env = apiEnvironmentSchema.parse(process.env);
  const intervalSeconds = refreshSecondsFor(source, env);
  if (env.COLLECTION_MODE === "worker") {
    return homeSystemResponseSchema.parse({
      data: await readSnapshot(source, homeSystemSnapshotSchema, intervalSeconds, Boolean(collectorConfig(source))),
    });
  }
  const hit = cached.get(source);
  if (hit && hit.until > Date.now()) return hit.result;
  const running = pending.get(source);
  if (running) return running;
  const task = collectHomeSystem(source)
    .then((result) => {
      cached.set(source, {
        until: Date.now() + intervalSeconds * 1000,
        result,
      });
      return result;
    })
    .finally(() => pending.delete(source));
  pending.set(source, task);
  return task;
}
