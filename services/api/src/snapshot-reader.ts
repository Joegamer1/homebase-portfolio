import { PrismaClient } from "@prisma/client";
import type { z } from "zod";
import type { CollectorHealth } from "@homebase/domain";

const globalPrisma = globalThis as typeof globalThis & { homebasePrisma?: PrismaClient };
const prisma = globalPrisma.homebasePrisma ?? new PrismaClient();
globalPrisma.homebasePrisma = prisma;

// API reads never initiate provider I/O when the dedicated worker owns collection.
export async function readSnapshot<T extends { collectedAt: string; stale: boolean }>(
  key: string,
  schema: z.ZodType<T>,
  intervalSeconds: number,
  configured = true,
): Promise<{ configured: boolean; health: CollectorHealth; snapshot: T | null }> {
  const now = new Date();
  if (!configured)
    return {
      configured,
      snapshot: null,
      health: {
        state: "disabled",
        checkedAt: now.toISOString(),
        stale: false,
        message: "Integration is not configured",
      },
    };
  const [stored, integration] = await Promise.all([
    prisma.integrationSnapshot.findUnique({ where: { integrationKey: key } }),
    prisma.integration.findUnique({ where: { key }, include: { health: true } }),
  ]);
  const parsed = schema.safeParse(stored?.payload);
  const snapshot = parsed.success ? parsed.data : null;
  const health = integration?.health;
  const ageSeconds = snapshot
    ? Math.max(0, Math.floor((now.getTime() - Date.parse(snapshot.collectedAt)) / 1000))
    : undefined;
  const overdue = ageSeconds !== undefined && ageSeconds > intervalSeconds * 2;
  const failed = health?.state === "DOWN" || health?.state === "DEGRADED";
  const stale = Boolean(snapshot && (snapshot.stale || failed || overdue));
  return {
    configured,
    snapshot: snapshot ? { ...snapshot, stale } : null,
    health: {
      state: !snapshot ? "down" : stale ? "degraded" : "healthy",
      checkedAt: now.toISOString(),
      lastAttemptAt: health?.lastAttemptAt?.toISOString(),
      lastSuccessAt: health?.lastSuccessAt?.toISOString(),
      lastError: health?.lastError ?? undefined,
      latencyMs: health?.latencyMs ?? undefined,
      stale,
      ageSeconds,
      nextRefreshAt: health?.lastAttemptAt
        ? new Date(health.lastAttemptAt.getTime() + intervalSeconds * 1000).toISOString()
        : undefined,
      message: !snapshot
        ? "Waiting for the first successful worker collection"
        : overdue
          ? "Scheduled collection is overdue; showing last known data"
          : failed
            ? "Provider collection is degraded; showing available data"
            : "Reading the latest collected snapshot",
    },
  };
}
