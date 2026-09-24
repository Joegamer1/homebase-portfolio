import { PrismaClient } from "@prisma/client";
import { apiEnvironmentSchema } from "@homebase/config";
import { collectProxmox } from "./proxmox.js";
import { collectService } from "./services.js";
import { collectHomeSystem, refreshSecondsFor } from "./home-systems.js";
import { collectSecurity } from "./security.js";
import { collectCareer } from "./career.js";
import { collectGames } from "./games.js";
import { collectFamily } from "./family.js";
import { checkCareerAvailability, CAREER_AVAILABILITY_INTERVAL_MS } from "./career-availability.js";
import { startScheduler } from "./scheduler.js";

const env = apiEnvironmentSchema.parse(process.env);
const globalPrisma = globalThis as typeof globalThis & { homebasePrisma?: PrismaClient };
const prisma = globalPrisma.homebasePrisma ?? new PrismaClient();
await prisma.collectorRun.updateMany({
  where: { completedAt: null },
  data: {
    completedAt: new Date(),
    success: false,
    error: "Collection interrupted before the worker restarted",
  },
});
const stop = startScheduler(
  [
    { name: "proxmox", intervalMs: 60000, run: collectProxmox },
    ...(["docker", "uptime-kuma"] as const).map((source) => ({
      name: source,
      intervalMs: env.SERVICE_REFRESH_SECONDS * 1000,
      run: () => collectService(source),
    })),
    ...(["pihole", "plex", "home-assistant", "tailscale"] as const).map((source) => ({
      name: source,
      intervalMs: refreshSecondsFor(source, env) * 1000,
      run: () => collectHomeSystem(source),
    })),
    { name: "security", intervalMs: env.SECURITY_REFRESH_SECONDS * 1000, run: collectSecurity },
    { name: "career-availability", intervalMs: CAREER_AVAILABILITY_INTERVAL_MS, run: checkCareerAvailability },
    { name: "career", intervalMs: env.CAREER_REFRESH_SECONDS * 1000, run: collectCareer },
    { name: "games", intervalMs: env.GAMES_REFRESH_SECONDS * 1000, run: collectGames },
    { name: "family", intervalMs: env.FAMILY_REFRESH_SECONDS * 1000, run: collectFamily },
    {
      name: "run-retention",
      intervalMs: 86400000,
      run: () =>
        prisma.collectorRun.deleteMany({
          where: {
            completedAt: { lt: new Date(Date.now() - env.COLLECTOR_RUN_RETENTION_DAYS * 86400000) },
          },
        }),
    },
  ],
  (name) => console.error(`Scheduled ${name} collection failed; next run remains scheduled`),
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void stop()
      .then(() => prisma.$disconnect())
      .then(() => {
        process.exitCode = 0;
      });
  });
console.log("HOMEBASE collection worker started");
