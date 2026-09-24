import { Prisma, PrismaClient } from "@prisma/client";
import { familyResponseSchema, familySnapshotSchema } from "@homebase/api-contracts";
import { normalizeCalendarEvents, normalizeSelectedStates } from "@homebase/collectors";
import { apiEnvironmentSchema } from "@homebase/config";
import { readSnapshot } from "./snapshot-reader.js";
const globalPrisma = globalThis as typeof globalThis & { homebasePrisma?: PrismaClient };
const prisma = globalPrisma.homebasePrisma ?? new PrismaClient();
globalPrisma.homebasePrisma = prisma;
export const isHouseholdCalendar = (calendar: { id: string; label: string }) =>
  !/donetick|chores?/i.test(`${calendar.id} ${calendar.label}`);
function withoutChoreCalendars<
  T extends { selectedCalendars: Array<{ id: string; label: string }>; events: Array<{ calendarId: string }> },
>(snapshot: T): T {
  const selectedCalendars = snapshot.selectedCalendars.filter(isHouseholdCalendar);
  const allowed = new Set(selectedCalendars.map((calendar) => calendar.id));
  return { ...snapshot, selectedCalendars, events: snapshot.events.filter((event) => allowed.has(event.calendarId)) };
}
const ha = () => {
  const env = apiEnvironmentSchema.parse(process.env);
  if (!env.HOME_ASSISTANT_BASE_URL || !env.HOME_ASSISTANT_TOKEN) return undefined;
  return {
    env,
    base: env.HOME_ASSISTANT_BASE_URL.replace(/\/$/, ""),
    headers: { Authorization: `Bearer ${env.HOME_ASSISTANT_TOKEN}`, Accept: "application/json" },
  };
};
export async function collectFamily() {
  try {
    return await collectFamilySnapshot();
  } catch {
    const stored = await prisma.integrationSnapshot.findUnique({ where: { integrationKey: "family" } });
    const previous = familySnapshotSchema.safeParse(stored?.payload);
    if (!previous.success) throw new Error("Family calendar collection unavailable");
    const stale = withoutChoreCalendars({
      ...previous.data,
      stale: true,
      events: previous.data.events.map((event) => ({ ...event, stale: true })),
    });
    await prisma.integrationSnapshot.upsert({
      where: { integrationKey: "family" },
      create: {
        integrationKey: "family",
        collectedAt: new Date(stale.collectedAt),
        payload: stale as Prisma.InputJsonValue,
      },
      update: { payload: stale as Prisma.InputJsonValue },
    });
    return familyResponseSchema.parse({
      data: {
        configured: true,
        health: {
          state: "degraded",
          checkedAt: new Date().toISOString(),
          stale: true,
          message: "Calendar collection failed; showing last known events",
        },
        snapshot: stale,
      },
    });
  }
}
async function collectFamilySnapshot() {
  const connection = ha();
  const now = new Date();
  const selections = await prisma.familySelection.findMany({ where: { active: true } });
  if (!connection)
    return familyResponseSchema.parse({
      data: {
        configured: false,
        health: {
          state: "disabled",
          checkedAt: now.toISOString(),
          stale: false,
          message: "Home Assistant is not configured",
        },
        snapshot: null,
      },
    });
  // All calendars exposed by HA are included, regardless of their upstream provider.
  const discovery = await fetch(`${connection.base}/api/calendars`, {
    headers: connection.headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!discovery.ok) throw new Error("Home Assistant calendar discovery failed");
  const raw: unknown = await discovery.json();
  if (!Array.isArray(raw)) throw new Error("Invalid calendar discovery response");
  const calendars = raw
    .map((item: unknown) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("entity_id" in item) ||
        typeof item.entity_id !== "string" ||
        !item.entity_id.startsWith("calendar.")
      )
        throw new Error("Invalid calendar discovery entry");
      return {
        externalId: item.entity_id,
        label: "name" in item && typeof item.name === "string" ? item.name : item.entity_id,
      };
    })
    .filter((item, index, all) => all.findIndex((other) => other.externalId === item.externalId) === index)
    .filter((item) => isHouseholdCalendar({ id: item.externalId, label: item.label }));
  const stored = await prisma.integrationSnapshot.findUnique({ where: { integrationKey: "family" } });
  const previous = familySnapshotSchema.safeParse(stored?.payload);
  // Include the current month's earlier days for a complete month grid.
  const rangeStart = new Date(now.getTime() - 32 * 86400000).toISOString();
  const rangeEnd = new Date(now.getTime() + Math.max(62, connection.env.FAMILY_CALENDAR_DAYS) * 86400000).toISOString();
  const entities = selections.filter((x) => x.kind === "entity");
  let calendarFailures = 0;
  const selectedEntities = entities.map((x) => ({ id: x.externalId, label: x.label, area: x.area ?? undefined }));
  const snapshot = {
    source: "family" as const,
    collectedAt: now.toISOString(),
    stale: false,
    configured: true,
    coverageStart: rangeStart,
    coverageEnd: rangeEnd,
    timezone: connection.env.HOMEBASE_TIMEZONE ?? "America/New_York",
    events: (
      await Promise.all(
        calendars
          .map(async (calendar) => {
            const start = rangeStart;
            const end = rangeEnd;
            const response = await fetch(
              `${connection.base}/api/calendars/${encodeURIComponent(calendar.externalId)}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
              { headers: connection.headers, signal: AbortSignal.timeout(10000) },
            );
            if (!response.ok) throw new Error(`Calendar ${calendar.externalId} returned HTTP ${response.status}`);
            return normalizeCalendarEvents(
              calendar.externalId,
              calendar.label,
              await response.json(),
              connection.env.HOMEBASE_TIMEZONE,
            );
          })
          .map((promise, index) =>
            promise.catch(() => {
              calendarFailures += 1;
              return previous.success
                ? previous.data.events
                    .filter((event) => event.calendarId === calendars[index]?.externalId)
                    .map((event) => ({ ...event, stale: true }))
                : [];
            }),
          ),
      )
    ).flat(),
    entities: entities.length
      ? normalizeSelectedStates(
          await (
            await fetch(`${connection.base}/api/states`, {
              headers: connection.headers,
              signal: AbortSignal.timeout(10000),
            })
          ).json(),
          selectedEntities,
          now.toISOString(),
        )
      : [],
    reminders: (await prisma.familyReminder.findMany({ orderBy: { dueAt: "asc" } })).map((r) => ({
      id: r.id,
      title: r.title,
      dueAt: r.dueAt?.toISOString(),
      completed: r.completed,
      updatedAt: r.updatedAt.toISOString(),
    })),
    selectedCalendars: calendars.map((x) => ({ id: x.externalId, label: x.label })),
    selectedEntities,
    capabilities: { calendars: calendars.length > 0, entities: entities.length > 0, reminders: true },
    providers: [
      {
        source: "home-assistant",
        state: calendarFailures ? ("degraded" as const) : ("healthy" as const),
        message: calendarFailures
          ? `${calendarFailures} selected calendar(s) unavailable; agenda is partial.`
          : undefined,
      },
    ],
    signals: [],
  };
  snapshot.stale = calendarFailures > 0;
  snapshot.events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const final = familySnapshotSchema.parse(snapshot);
  await prisma.integrationSnapshot.upsert({
    where: { integrationKey: "family" },
    create: { integrationKey: "family", collectedAt: now, payload: final as Prisma.InputJsonValue },
    update: { collectedAt: now, payload: final as Prisma.InputJsonValue },
  });
  await prisma.integration.upsert({
    where: { key: "family" },
    create: { key: "family", name: "Family", enabled: true, mockMode: false },
    update: { enabled: true },
  });
  return familyResponseSchema.parse({
    data: {
      configured: true,
      health: {
        state: calendarFailures ? "degraded" : "healthy",
        checkedAt: now.toISOString(),
        lastSuccessAt: now.toISOString(),
        stale: calendarFailures > 0,
        message: calendarFailures
          ? "Calendar coverage is incomplete; retained events may be stale"
          : "All Home Assistant calendars collected",
      },
      snapshot: final,
    },
  });
}

export async function discoverFamilySources() {
  const connection = ha();
  if (!connection) return { data: { configured: false, calendars: [], entities: [] } };
  const [calendarResponse, statesResponse] = await Promise.all([
    fetch(`${connection.base}/api/calendars`, { headers: connection.headers, signal: AbortSignal.timeout(10000) }),
    fetch(`${connection.base}/api/states`, { headers: connection.headers, signal: AbortSignal.timeout(10000) }),
  ]);
  if (!calendarResponse.ok || !statesResponse.ok) throw new Error("Home Assistant discovery failed");
  const calendars = ((await calendarResponse.json()) as unknown[]).flatMap((item) => {
    const value = item as Record<string, unknown>;
    const id = typeof value.entity_id === "string" ? value.entity_id : "";
    return id ? [{ id, label: typeof value.name === "string" ? value.name : id }] : [];
  });
  const entities = ((await statesResponse.json()) as unknown[])
    .flatMap((item) => {
      const value = item as Record<string, unknown>;
      const entityId = typeof value.entity_id === "string" ? value.entity_id : "";
      const attrs = (value.attributes && typeof value.attributes === "object" ? value.attributes : {}) as Record<
        string,
        unknown
      >;
      if (!entityId || !/^(binary_sensor|sensor|lock|update)\./.test(entityId)) return [];
      return [
        {
          id: entityId,
          label: typeof attrs.friendly_name === "string" ? attrs.friendly_name : entityId,
          kind: entityId.split(".")[0],
        },
      ];
    })
    .slice(0, 500);
  return { data: { configured: true, calendars, entities } };
}

export async function updateFamilySelection(input: {
  kind: "calendar" | "entity";
  externalId: string;
  label: string;
  area?: string;
  active?: boolean;
}) {
  if (!/^(calendar|entity)$/.test(input.kind) || input.externalId.length > 200 || input.label.length > 200)
    throw new Error("Invalid household selection");
  return {
    data: await prisma.familySelection.upsert({
      where: { kind_externalId: { kind: input.kind, externalId: input.externalId } },
      create: {
        kind: input.kind,
        externalId: input.externalId,
        label: input.label,
        area: input.area,
        active: input.active ?? true,
      },
      update: { label: input.label, area: input.area, active: input.active ?? true },
    }),
  };
}
export async function getFamily() {
  const env = apiEnvironmentSchema.parse(process.env);
  if (env.COLLECTION_MODE === "worker") {
    const data = await readSnapshot("family", familySnapshotSchema, env.FAMILY_REFRESH_SECONDS, Boolean(ha()));
    if (data.snapshot) {
      data.snapshot = withoutChoreCalendars(data.snapshot);
      data.snapshot.reminders = (await prisma.familyReminder.findMany({ orderBy: { dueAt: "asc" } })).map((row) => ({
        id: row.id,
        title: row.title,
        dueAt: row.dueAt?.toISOString(),
        completed: row.completed,
        updatedAt: row.updatedAt.toISOString(),
      }));
    }
    return familyResponseSchema.parse({ data });
  }
  return collectFamily();
}
export async function updateReminder(
  id: string | undefined,
  input: { title?: string; dueAt?: string; completed?: boolean },
) {
  const data = {
    ...(input.title ? { title: input.title.slice(0, 200) } : {}),
    ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
    ...(input.completed !== undefined ? { completed: input.completed } : {}),
  };
  const row = id
    ? await prisma.familyReminder.update({ where: { id }, data })
    : await prisma.familyReminder.create({ data: { title: data.title ?? "Reminder", dueAt: data.dueAt } });
  return { data: row };
}
