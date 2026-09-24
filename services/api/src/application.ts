import {
  attentionResponseSchema,
  healthResponseSchema,
  homeResponseSchema,
  integrationsResponseSchema,
} from "@homebase/api-contracts";

import { getService } from "./services.js";
import { getHomeSystem } from "./home-systems.js";
import { getSecurity } from "./security.js";
import { getProxmox } from "./proxmox.js";
import { getCareer } from "./career.js";
import { getGames } from "./games.js";
import { getFamily } from "./family.js";

export async function getHealth() {
  return healthResponseSchema.parse({
    data: { service: "homebase-api", status: "ok", version: "v1", checkedAt: new Date().toISOString() },
  });
}

export async function getHome() {
  const generatedAt = new Date().toISOString();
  const statuses = (["lab", "security", "career"] as const).map((domain) => ({
    domain,
    value: "0",
    state: "healthy" as const,
  }));
  const servicesPromise = Promise.all(
    (["docker", "uptime-kuma"] as const).map(async (key) => {
      try {
        return { key, ...(await getService(key)).data };
      } catch {
        return {
          key,
          configured: true,
          snapshot: null,
          health: {
            state: "down" as const,
            checkedAt: new Date().toISOString(),
            stale: true,
            message: "Integration temporarily unavailable",
          },
        };
      }
    }),
  );
  const homeSystemsPromise = Promise.all(
    (["pihole", "plex", "home-assistant", "tailscale"] as const).map(async (key) => {
      try {
        return { key, ...(await getHomeSystem(key)).data };
      } catch {
        return {
          key,
          configured: true,
          snapshot: null,
          health: {
            state: "down" as const,
            checkedAt: new Date().toISOString(),
            stale: true,
            message: "Integration temporarily unavailable",
          },
        };
      }
    }),
  );
  const securityPromise = getSecurity().catch(() => ({
    data: {
      configured: true as const,
      snapshot: null,
      health: {
        state: "down" as const,
        checkedAt: new Date().toISOString(),
        stale: true,
        message: "Security intelligence temporarily unavailable",
      },
    },
  }));
  const careerPromise = getCareer().catch(() => ({
    data: {
      configured: true as const,
      snapshot: null,
      health: {
        state: "down" as const,
        checkedAt: new Date().toISOString(),
        stale: true,
        message: "Career Radar temporarily unavailable",
      },
    },
  }));
  const gamesPromise = getGames().catch(() => ({
    data: {
      configured: false,
      snapshot: null,
      health: {
        state: "down" as const,
        checkedAt: new Date().toISOString(),
        stale: true,
        message: "Games temporarily unavailable",
      },
    },
  }));
  const familyPromise = getFamily().catch(() => ({
    data: {
      configured: false,
      snapshot: null,
      health: {
        state: "down" as const,
        checkedAt: new Date().toISOString(),
        stale: true,
        message: "Family temporarily unavailable",
      },
    },
  }));
  const proxmoxPromise = getProxmox().catch(() => ({
    data: {
      configured: true,
      snapshot: null,
      health: {
        state: "down" as const,
        checkedAt: new Date().toISOString(),
        stale: true,
        message: "Proxmox temporarily unavailable",
      },
    },
  }));
  const [services, homeSystems, security, career, proxmox, games, family] = await Promise.all([
    servicesPromise,
    homeSystemsPromise,
    securityPromise,
    careerPromise,
    proxmoxPromise,
    gamesPromise,
    familyPromise,
  ]);
  const providers = [
    { key: "proxmox", ...proxmox.data },
    ...services,
    ...homeSystems,
    { key: "security-intelligence", ...security.data },
    { key: "career-radar", ...career.data },
    { key: "family", ...family.data },
  ];
  const labProviders = [{ key: "proxmox", ...proxmox.data }, ...services, ...homeSystems];
  const liveSignals = providers.flatMap(
    (item) =>
      item.snapshot?.signals.map((signal) => ({
        ...signal,
        summary: item.health.stale ? `Last known condition (stale): ${signal.summary}` : signal.summary,
      })) ?? [],
  );
  const familyZone = family.data.snapshot?.timezone ?? "America/New_York";
  const dayKey = (value: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: familyZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  const currentDay = dayKey(generatedAt);
  const familyEvents = (family.data.snapshot?.events ?? []).filter((event) => !event.cancelled);
  const todayEvents = familyEvents.filter((event) =>
    event.allDay
      ? event.startsAt.slice(0, 10) <= currentDay &&
        (event.endsAt ? event.endsAt.slice(0, 10) > currentDay : event.startsAt.slice(0, 10) === currentDay)
      : dayKey(event.startsAt) <= currentDay &&
        dayKey(event.endsAt ? new Date(Date.parse(event.endsAt) - 1).toISOString() : event.startsAt) >= currentDay,
  );
  const nextWeek = new Date(generatedAt);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const nextWeekDay = dayKey(nextWeek.toISOString());
  const upcomingEvents = familyEvents.filter((event) => {
    const start = event.allDay ? event.startsAt.slice(0, 10) : dayKey(event.startsAt);
    const end = event.allDay ? (event.endsAt?.slice(0, 10) ?? start) : dayKey(event.endsAt ?? event.startsAt);
    return start < nextWeekDay && (event.allDay ? end > currentDay : end >= currentDay);
  });
  const nextEvent = familyEvents.find((event) =>
    event.allDay
      ? (event.endsAt?.slice(0, 10) ?? event.startsAt.slice(0, 10)) > currentDay
      : Date.parse(event.endsAt ?? event.startsAt) >= Date.now(),
  );
  return homeResponseSchema.parse({
    data: {
      generatedAt,
      mode: "live",
      stale: providers.some((item) => item.health.stale),
      attention: liveSignals.sort((a, b) => b.score - a.score),
      today: todayEvents.slice(0, 12).map((event) => ({
        id: event.id,
        title: event.title,
        time: event.allDay
          ? "All day"
          : new Date(event.startsAt).toLocaleTimeString("en-US", {
              timeZone: familyZone,
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
        meta: `${event.calendarLabel}${event.stale || family.data.health.stale ? " · Last known (stale)" : ""}`,
      })),
      calendarOutlook: family.data.snapshot
        ? {
            nextSevenDaysCount: upcomingEvents.length,
            nextEvent: nextEvent?.title,
            stale: family.data.health.stale || family.data.snapshot.stale,
          }
        : undefined,
      statuses: [
        ...statuses.map((status) =>
          status.domain === "security"
            ? {
                ...status,
                value: String(security.data.snapshot?.signals.length ?? 0),
                state:
                  security.data.health.state === "down"
                    ? ("critical" as const)
                    : security.data.health.stale || security.data.health.state === "degraded"
                      ? ("warning" as const)
                      : security.data.snapshot?.signals.length
                        ? ("warning" as const)
                        : ("healthy" as const),
              }
            : status.domain === "career"
              ? {
                  ...status,
                  value: String(
                    career.data.snapshot?.jobs.filter(
                      (job) =>
                        job.status === "new" &&
                        job.available !== false &&
                        job.matchScore >= 75 &&
                        job.careerValueScore >= 70,
                    ).length ?? 0,
                  ),
                  state:
                    career.data.health.state === "down"
                      ? ("critical" as const)
                      : career.data.health.stale || career.data.health.state === "degraded"
                        ? ("warning" as const)
                        : ("healthy" as const),
                }
              : status.domain === "lab"
                ? {
                    ...status,
                    value: String(
                      labProviders.reduce((count, item) => count + (item.snapshot?.signals.length ?? 0), 0),
                    ),
                    state: labProviders.some((item) => item.health.state === "down")
                      ? ("critical" as const)
                      : labProviders.some(
                            (item) =>
                              item.health.stale || item.health.state === "degraded" || item.snapshot?.signals.length,
                          )
                        ? ("warning" as const)
                        : ("healthy" as const),
                  }
                : status,
        ),
        {
          domain: "family",
          value: family.data.snapshot ? `${todayEvents.length} today` : "Unavailable",
          state: family.data.health.stale || family.data.health.state !== "healthy" ? "warning" : "healthy",
        },
      ],
      focus: [],
      changes: [],
      lab: labProviders
        .filter((item) => item.configured && item.snapshot)
        .map((item) => ({
          id: item.key,
          label: `${item.key} alerts`,
          value: item.snapshot?.signals.length ?? 0,
          unit: "",
          status:
            item.health.state === "down"
              ? "critical"
              : item.health.stale || item.health.state === "degraded" || item.snapshot?.signals.length
                ? "warning"
                : "healthy",
          source: item.key,
          collectedAt: item.snapshot!.collectedAt,
          stale: item.health.stale,
        })),
      media: [],
      jobs:
        career.data.snapshot?.jobs
          .filter((job) => job.available !== false && (job.status === "new" || job.status === "saved"))
          .slice(0, 6)
          .map((job) => ({
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location,
            arrangement: job.arrangement,
            salary:
              job.salaryMin || job.salaryMax
                ? `${job.salaryCurrency ?? "USD"} ${(job.salaryMin ?? job.salaryMax)?.toLocaleString()}–${(job.salaryMax ?? job.salaryMin)?.toLocaleString()}`
                : "Not listed",
            matchScore: job.matchScore,
            careerValueScore: job.careerValueScore,
            reasons: job.reasons,
            gaps: job.gaps,
          })) ?? [],
      games:
        games.data.snapshot?.updates
          .filter(
            (item: { dismissed: boolean; relevanceTier: number; read: boolean }) =>
              !item.dismissed && (item.relevanceTier < 5 || item.read),
          )
          .slice(0, 6)
          .map((item) => ({
            id: item.id,
            game: item.gameLabel,
            title: `${item.patch} · ${item.entity ?? item.title}`,
            summary: `${item.relevanceReason} ${item.summary}`,
            source: item.source,
            tier: item.relevanceTier === 1 ? ("official" as const) : ("trusted" as const),
            affected: item.entity ? [item.entity] : [],
          })) ?? [],
      family: familyEvents
        .filter((event) =>
          event.allDay
            ? (event.endsAt?.slice(0, 10) ?? event.startsAt.slice(0, 10)) >= currentDay
            : Date.parse(event.endsAt ?? event.startsAt) >= Date.now(),
        )
        .slice(0, 6)
        .map((event) => ({
          id: event.id,
          title: event.title,
          detail: `${event.calendarLabel} · ${event.allDay ? event.startsAt.slice(0, 10) : new Date(event.startsAt).toLocaleString("en-US", { timeZone: familyZone })}${event.stale || family.data.health.stale ? " · Last known (stale)" : ""}`,
          state: event.stale || family.data.health.stale ? "attention" : "normal",
        })),
      integrations: [
        {
          key: "proxmox",
          name: "Proxmox",
          mode: proxmox.data.configured ? "live" : "disabled",
          health: proxmox.data.health,
        },
        { key: "games", name: "Games", mode: games.data.configured ? "live" : "disabled", health: games.data.health },
        {
          key: "family",
          name: "Family",
          mode: family.data.configured ? "live" : "disabled",
          health: family.data.health,
        },
        ...services.map((item) => ({
          key: item.key,
          name: item.key === "docker" ? "Docker" : "Uptime Kuma",
          mode: item.configured ? "live" : "disabled",
          health: item.health,
        })),
        ...homeSystems.map((item) => ({
          key: item.key,
          name:
            item.key === "pihole"
              ? "Pi-hole"
              : item.key === "plex"
                ? "Plex"
                : item.key === "home-assistant"
                  ? "Home Assistant"
                  : "Tailscale",
          mode: item.configured ? ("live" as const) : ("disabled" as const),
          health: item.health,
        })),
        {
          key: "security-intelligence",
          name: "Security Intelligence",
          mode: "live" as const,
          health: security.data.health,
        },
        {
          key: "career-radar",
          name: "Career Radar",
          mode: "live" as const,
          health: career.data.health,
        },
      ],
    },
  });
}

export async function getAttention() {
  const home = await getHome();
  return attentionResponseSchema.parse({
    data: { generatedAt: home.data.generatedAt, stale: home.data.stale, items: home.data.attention },
  });
}

export async function getIntegrations() {
  const home = await getHome();
  return integrationsResponseSchema.parse({
    data: { generatedAt: home.data.generatedAt, integrations: home.data.integrations },
  });
}
