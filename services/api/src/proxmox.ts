import { z } from "zod";
import { readSnapshot } from "./snapshot-reader.js";
import { IntegrationState, Prisma, PrismaClient } from "@prisma/client";
import { proxmoxResponseSchema, proxmoxSnapshotSchema } from "@homebase/api-contracts";
import { rankAttention } from "@homebase/attention-engine";
import { ProxmoxCollector, evaluateProxmoxPressure, type ProxmoxCollectorConfig } from "@homebase/collectors";
import { apiEnvironmentSchema } from "@homebase/config";

const globalPrisma = globalThis as typeof globalThis & { homebasePrisma?: PrismaClient };
const prisma = globalPrisma.homebasePrisma ?? new PrismaClient();
globalPrisma.homebasePrisma = prisma;

function collectorConfig(): ProxmoxCollectorConfig | undefined {
  const environment = apiEnvironmentSchema.parse(process.env);
  if (!environment.PROXMOX_BASE_URL || !environment.PROXMOX_TOKEN_ID || !environment.PROXMOX_TOKEN_SECRET)
    return undefined;
  return {
    baseUrl: environment.PROXMOX_BASE_URL,
    tokenId: environment.PROXMOX_TOKEN_ID,
    tokenSecret: environment.PROXMOX_TOKEN_SECRET,
    tlsVerify: environment.PROXMOX_TLS_VERIFY,
    storageWarningPercent: environment.PROXMOX_STORAGE_WARNING_PERCENT,
    cpuWarningPercent: environment.PROXMOX_CPU_WARNING_PERCENT,
    memoryWarningPercent: environment.PROXMOX_MEMORY_WARNING_PERCENT,
    expectedDownIds: new Set(
      environment.PROXMOX_EXPECTED_DOWN_IDS.split(",")
        .map((value) => Number(value.trim()))
        .filter(Number.isInteger),
    ),
  };
}

const disabledHealth = () => {
  const checkedAt = new Date().toISOString();
  return {
    state: "disabled" as const,
    checkedAt,
    lastAttemptAt: checkedAt,
    stale: false,
    message: "Proxmox credentials are not configured",
  };
};

export async function collectProxmox() {
  const config = collectorConfig();
  if (!config)
    return proxmoxResponseSchema.parse({ data: { configured: false, health: disabledHealth(), snapshot: null } });

  const integration = await prisma.integration.upsert({
    where: { key: "proxmox" },
    create: { key: "proxmox", name: "Proxmox", enabled: true, mockMode: false },
    update: { enabled: true, mockMode: false },
  });
  const startedAt = new Date();
  const run = await prisma.collectorRun.create({ data: { integrationId: integration.id, startedAt } });
  const collector = new ProxmoxCollector(config);
  const started = Date.now();

  try {
    const snapshot = await collector.collect();
    const pressureRow = await prisma.integrationSnapshot.findUnique({ where: { integrationKey: "proxmox-pressure" } });
    const priorPressure = z
      .object({
        checkedAt: z.string().datetime(),
        metrics: z.record(z.string(), z.object({ since: z.string().datetime(), active: z.boolean() })),
      })
      .safeParse(pressureRow?.payload);
    const pressure = evaluateProxmoxPressure(snapshot, config, priorPressure.success ? priorPressure.data : undefined);
    snapshot.signals.push(...pressure.signals);
    const latencyMs = Date.now() - started;
    const clientSnapshot = proxmoxSnapshotSchema.parse({ ...snapshot, signals: rankAttention(snapshot.signals) });
    await prisma.$transaction([
      prisma.integrationSnapshot.upsert({
        where: { integrationKey: "proxmox-pressure" },
        create: {
          integrationKey: "proxmox-pressure",
          collectedAt: new Date(snapshot.collectedAt),
          payload: pressure.state as unknown as Prisma.InputJsonValue,
        },
        update: {
          collectedAt: new Date(snapshot.collectedAt),
          payload: pressure.state as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.integrationSnapshot.upsert({
        where: { integrationKey: "proxmox" },
        create: {
          integrationKey: "proxmox",
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
          itemCount:
            snapshot.nodes.length + snapshot.workloads.length + snapshot.storage.length + snapshot.failedTasks.length,
        },
      }),
    ]);
    const checkedAt = new Date().toISOString();
    return proxmoxResponseSchema.parse({
      data: {
        configured: true,
        health: {
          state: "healthy",
          checkedAt,
          lastAttemptAt: checkedAt,
          lastSuccessAt: checkedAt,
          latencyMs,
          stale: false,
          message: "Live Proxmox data collected",
        },
        snapshot: clientSnapshot,
      },
    });
  } catch (error) {
    const checkedAt = new Date();
    const latencyMs = Date.now() - started;
    const message =
      error instanceof Error ? error.message.replaceAll(config.tokenSecret, "[redacted]") : "Proxmox collection failed";
    const [cached, previousHealth] = await Promise.all([
      prisma.integrationSnapshot.findUnique({ where: { integrationKey: "proxmox" } }),
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
    const snapshot = cached ? proxmoxSnapshotSchema.parse({ ...(cached.payload as object), stale: true }) : null;
    return proxmoxResponseSchema.parse({
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

let pending: Promise<Awaited<ReturnType<typeof collectProxmox>>> | undefined;
let cached: { until: number; result: Awaited<ReturnType<typeof collectProxmox>> } | undefined;

export async function getProxmox() {
  if (apiEnvironmentSchema.parse(process.env).COLLECTION_MODE === "worker") {
    return proxmoxResponseSchema.parse({
      data: await readSnapshot("proxmox", proxmoxSnapshotSchema, 60, Boolean(collectorConfig())),
    });
  }
  if (cached && cached.until > Date.now()) return cached.result;
  if (pending) return pending;
  pending = collectProxmox()
    .then((result) => {
      cached = { until: Date.now() + 60_000, result };
      return result;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
