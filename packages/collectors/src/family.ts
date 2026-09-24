import { createHash } from "node:crypto";
import type { FamilyEntity, FamilyEvent } from "@homebase/domain";
type Json = Record<string, unknown>;
const record = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const id = (v: string) => createHash("sha256").update(`home-assistant:${v}`).digest("hex").slice(0, 24);

export function normalizeSelectedStates(
  statesRaw: unknown,
  selected: Array<{ id: string; label: string; area?: string }>,
  collectedAt: string,
): FamilyEntity[] {
  if (!Array.isArray(statesRaw)) throw new Error("Invalid Home Assistant state list");
  const allowed = new Map(selected.map((item) => [item.id, item]));
  return statesRaw.flatMap((raw) => {
    const item = record(raw);
    const entityId = str(item.entity_id) ?? "";
    const choice = allowed.get(entityId);
    if (!choice) return [];
    const attrs = record(item.attributes);
    const state = str(item.state) ?? "unknown";
    return [
      {
        id: id(entityId),
        entityId,
        name: choice.label || str(attrs.friendly_name) || entityId,
        kind: entityId.split(".")[0] ?? "entity",
        deviceClass: str(attrs.device_class),
        state,
        unit: str(attrs.unit_of_measurement),
        area: choice.area,
        lastChangedAt: str(item.last_changed),
        collectedAt,
        stale: false,
      },
    ];
  });
}

export function normalizeCalendarEvents(
  calendarId: string,
  calendarLabel: string,
  raw: unknown,
  timezone?: string,
): FamilyEvent[] {
  const rows = Array.isArray(raw) ? raw : (record(raw).events as unknown[] | undefined);
  if (!Array.isArray(rows)) throw new Error("Invalid Home Assistant calendar response");
  return rows.flatMap((value) => {
    const item = record(value);
    const suppliedId = str(item.uid) ?? str(item.id);
    const start = record(item.start);
    const end = record(item.end);
    const startsAt = str(start.dateTime) ?? str(start.date);
    if (!startsAt || !Number.isFinite(Date.parse(startsAt))) throw new Error("Invalid calendar event start");
    const endsAt = str(end.dateTime) ?? str(end.date);
    if (endsAt && (!Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)))
      throw new Error("Invalid calendar event end");
    // HA's documented response does not require a UID. Keep local calendar events too.
    const externalId = suppliedId ?? id(JSON.stringify([item.summary, startsAt, endsAt, item.location]));
    return [
      {
        id: id(`${calendarId}:${externalId}:${startsAt}`),
        externalId,
        calendarId,
        calendarLabel,
        title: str(item.summary) ?? "Untitled event",
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        allDay: Boolean(start.date && !start.dateTime),
        timezone: str(start.timeZone) ?? timezone,
        location: str(item.location),
        source: "home-assistant" as const,
        updatedAt: str(item.updated),
        cancelled: item.status === "cancelled",
      },
    ];
  });
}
