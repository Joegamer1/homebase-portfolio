import { describe, expect, it } from "vitest";
import { normalizeCalendarEvents, normalizeSelectedStates } from "./family.js";

describe("family normalization", () => {
  it("retains Home Assistant local events without UID and gives stable occurrence IDs", () => {
    const raw = [
      {
        summary: "Sample work",
        start: { dateTime: "2026-09-17T08:00:00-04:00" },
        end: { dateTime: "2026-09-17T16:00:00-04:00" },
      },
    ];
    const events = normalizeCalendarEvents("calendar.sample", "Sample", raw);
    expect(events).toHaveLength(1);
    expect(events[0]?.startsAt).toBe("2026-09-17T12:00:00.000Z");
    expect(normalizeCalendarEvents("calendar.sample", "Sample", raw)[0]?.id).toBe(events[0]?.id);
    expect(normalizeCalendarEvents("calendar.other", "Other", raw)[0]?.id).not.toBe(events[0]?.id);
  });
  it("fails malformed dates so a bad response cannot replace good cached events", () => {
    expect(() => normalizeCalendarEvents("calendar.home", "Home", [{ start: { dateTime: "bad" } }])).toThrow();
  });
  it("keeps only explicitly selected entities and preserves healthy states", () => {
    const result = normalizeSelectedStates(
      [
        { entity_id: "binary_sensor.front", state: "on", attributes: { device_class: "door" } },
        { entity_id: "sensor.private", state: "secret" },
      ],
      [{ id: "binary_sensor.front", label: "Front door", area: "Entry" }],
      "2026-01-01T00:00:00.000Z",
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Front door", state: "on", deviceClass: "door" });
  });
  it("normalizes all-day and timed events without dropping cancellation", () => {
    const result = normalizeCalendarEvents(
      "calendar.home",
      "Home",
      {
        events: [
          { uid: "a", summary: "All day", start: { date: "2026-03-08" }, end: { date: "2026-03-09" } },
          { uid: "b", summary: "Cancelled", start: { dateTime: "2026-03-08T12:00:00-05:00" }, status: "cancelled" },
        ],
      },
      "America/New_York",
    );
    expect(result[0]?.allDay).toBe(true);
    expect(result[1]?.cancelled).toBe(true);
  });
});
