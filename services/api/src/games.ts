import { Prisma, PrismaClient, IntegrationState } from "@prisma/client";
import { gameSnapshotSchema, gamesResponseSchema } from "@homebase/api-contracts";
import { OfficialGamePatchCollector } from "@homebase/collectors";
import { apiEnvironmentSchema } from "@homebase/config";
import { readSnapshot } from "./snapshot-reader.js";
import type { GameProfile } from "@homebase/domain";
import { z } from "zod";

const globalPrisma = globalThis as typeof globalThis & { homebasePrisma?: PrismaClient };
const prisma = globalPrisma.homebasePrisma ?? new PrismaClient();
globalPrisma.homebasePrisma = prisma;
const seeds = [
  { game: "league-of-legends", entityId: "yunara", name: "Yunara", kind: "champion" },
  { game: "league-of-legends", entityId: "katarina", name: "Katarina", kind: "champion" },
  { game: "deadlock", entityId: "holliday", name: "Holliday", kind: "hero" },
  { game: "deadlock", entityId: "pocket", name: "Pocket", kind: "hero" },
] as const;
async function profile(): Promise<GameProfile> {
  for (const seed of seeds)
    await prisma.gamePreference.upsert({
      where: { game_entityId: { game: seed.game, entityId: seed.entityId } },
      create: seed,
      update: {},
    });
  const rows = await prisma.gamePreference.findMany({ where: { active: true } });
  return {
    tracked: rows.map((row) => ({
      game: row.game as GameProfile["tracked"][number]["game"],
      entityId: row.entityId,
      name: row.name,
      kind: row.kind as GameProfile["tracked"][number]["kind"],
    })),
    queues: [],
    roles: [],
  };
}
export async function collectGames() {
  const env = apiEnvironmentSchema.parse(process.env);
  const p = await profile();
  const configs = [
    { game: "league-of-legends" as const, url: env.GAMES_LEAGUE_URL },
    { game: "deadlock" as const, url: env.GAMES_DEADLOCK_URL },
  ].filter((item): item is { game: "league-of-legends" | "deadlock"; url: string } => Boolean(item.url));
  const integration = await prisma.integration.upsert({
    where: { key: "games" },
    create: { key: "games", name: "Games", enabled: true, mockMode: false },
    update: { enabled: true },
  });
  const started = await prisma.collectorRun.create({ data: { integrationId: integration.id, startedAt: new Date() } });
  try {
    if (!configs.length) throw new Error("No verified game sources configured");
    const snapshot = await new OfficialGamePatchCollector(configs).collect(p);
    const previous = await prisma.integrationSnapshot.findUnique({ where: { integrationKey: "games" } });
    const old = gameSnapshotSchema.safeParse(previous?.payload);
    const freshIds = new Set(snapshot.updates.map((u) => u.id));
    const retained = old.success ? old.data.updates.filter((u) => !freshIds.has(u.id)) : [];
    const states = await prisma.gameUpdateState.findMany();
    const stateMap = new Map(states.map((s) => [s.updateKey, s]));
    const updates = [...snapshot.updates, ...retained]
      .map((u) => ({
        ...u,
        ...(stateMap.has(u.id)
          ? {
              saved: stateMap.get(u.id)!.saved,
              read: stateMap.get(u.id)!.read,
              dismissed: stateMap.get(u.id)!.dismissed,
              note: stateMap.get(u.id)!.note ?? undefined,
            }
          : {}),
      }))
      .sort(
        (a, b) =>
          a.relevanceTier - b.relevanceTier ||
          Number(a.read) - Number(b.read) ||
          b.publishedAt.localeCompare(a.publishedAt),
      );
    const final = gameSnapshotSchema.parse({ ...snapshot, updates: updates.slice(0, 1000) });
    await prisma.$transaction([
      prisma.integrationSnapshot.upsert({
        where: { integrationKey: "games" },
        create: {
          integrationKey: "games",
          collectedAt: new Date(final.collectedAt),
          payload: final as Prisma.InputJsonValue,
        },
        update: { collectedAt: new Date(final.collectedAt), payload: final as Prisma.InputJsonValue },
      }),
      prisma.integrationHealth.upsert({
        where: { integrationId: integration.id },
        create: {
          integrationId: integration.id,
          state: snapshot.providers.some((x) => x.state === "down")
            ? IntegrationState.DEGRADED
            : IntegrationState.HEALTHY,
          lastAttemptAt: new Date(),
          lastSuccessAt: new Date(),
        },
        update: {
          state: snapshot.providers.some((x) => x.state === "down")
            ? IntegrationState.DEGRADED
            : IntegrationState.HEALTHY,
          lastAttemptAt: new Date(),
          lastSuccessAt: new Date(),
          lastError: null,
        },
      }),
      prisma.collectorRun.update({
        where: { id: started.id },
        data: { completedAt: new Date(), success: true, itemCount: updates.length },
      }),
    ]);
    return gamesResponseSchema.parse({
      data: {
        configured: true,
        health: {
          state: snapshot.providers.some((x) => x.state === "down") ? "degraded" : "healthy",
          checkedAt: new Date().toISOString(),
          lastSuccessAt: final.collectedAt,
          stale: snapshot.stale,
          message: "Game sources collected",
        },
        snapshot: final,
      },
    });
  } catch (error) {
    await prisma.collectorRun.update({
      where: { id: started.id },
      data: {
        completedAt: new Date(),
        success: false,
        error: error instanceof Error ? error.message : "Game collection failed",
      },
    });
    return gamesResponseSchema.parse({
      data: await readSnapshot(
        "games",
        gameSnapshotSchema,
        apiEnvironmentSchema.parse(process.env).GAMES_REFRESH_SECONDS,
        Boolean(env.GAMES_LEAGUE_URL || env.GAMES_DEADLOCK_URL),
      ),
    });
  }
}
export async function getGames(): Promise<Awaited<ReturnType<typeof gamesResponseSchema.parse>>> {
  const env = apiEnvironmentSchema.parse(process.env);
  if (env.COLLECTION_MODE === "worker") {
    const result = gamesResponseSchema.parse({
      data: await readSnapshot(
        "games",
        gameSnapshotSchema,
        env.GAMES_REFRESH_SECONDS,
        Boolean(env.GAMES_LEAGUE_URL || env.GAMES_DEADLOCK_URL),
      ),
    });
    if (result.data.snapshot) {
      const states = new Map((await prisma.gameUpdateState.findMany()).map((s) => [s.updateKey, s]));
      result.data.snapshot.updates = result.data.snapshot.updates.map((u) => {
        const state = states.get(u.id);
        return state
          ? { ...u, saved: state.saved, read: state.read, dismissed: state.dismissed, note: state.note ?? undefined }
          : u;
      });
    }
    return result;
  }
  return collectGames();
}
export async function updateGameState(
  id: string,
  input: { saved?: boolean; read?: boolean; dismissed?: boolean; note?: string },
) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new Error("Invalid update id");
  input = z
    .object({
      saved: z.boolean().optional(),
      read: z.boolean().optional(),
      dismissed: z.boolean().optional(),
      note: z.string().max(1000).optional(),
    })
    .strict()
    .parse(input);
  const state = await prisma.gameUpdateState.upsert({
    where: { updateKey: id },
    create: { updateKey: id, ...input, note: input.note?.slice(0, 1000) },
    update: { ...input, note: input.note?.slice(0, 1000) },
  });
  return { data: state };
}
