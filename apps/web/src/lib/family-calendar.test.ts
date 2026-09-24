import { describe, expect, it } from "vitest";
import { eventsOnDay, calendarOutlook, type CalendarEvent } from "./family-calendar";
const event = (values: Partial<CalendarEvent>): CalendarEvent => ({
  id: "1",
  externalId: "1",
  title: "Work",
  calendarId: "calendar.work",
  calendarLabel: "Work",
  startsAt: "2026-03-08T12:00:00Z",
  endsAt: "2026-03-08T20:00:00Z",
  allDay: false,
  source: "home-assistant",
  ...values,
});
describe("family outlook", () => {
  it("keeps all-day events on their civil dates with exclusive end", () => {
    const events = [event({ allDay: true, startsAt: "2026-03-08T00:00:00Z", endsAt: "2026-03-10T00:00:00Z" })];
    expect(eventsOnDay(events, "2026-03-07", "America/New_York")).toHaveLength(0);
    expect(eventsOnDay(events, "2026-03-09", "America/New_York")).toHaveLength(1);
    expect(eventsOnDay(events, "2026-03-10", "America/New_York")).toHaveLength(0);
  });
  it("includes overnight shifts in both days across DST", () => {
    const events = [event({ startsAt: "2026-03-08T04:00:00Z", endsAt: "2026-03-08T12:00:00Z" })];
    expect(eventsOnDay(events, "2026-03-07", "America/New_York")).toHaveLength(1);
    expect(eventsOnDay(events, "2026-03-08", "America/New_York")).toHaveLength(1);
    expect(calendarOutlook(events, "2026-03-07", 7, "America/New_York").upcoming).toHaveLength(1);
  });
  it("excludes cancelled, stale, all-day and adjacent events from conflicts", () => {
    const events = [
      event({}),
      event({ id: "2", startsAt: "2026-03-08T20:00:00Z", endsAt: "2026-03-08T22:00:00Z" }),
      event({ id: "3", cancelled: true }),
      event({ id: "4", stale: true }),
      event({ id: "5", allDay: true }),
    ];
    expect(calendarOutlook(events, "2026-03-08", 7, "America/New_York").overlaps).toHaveLength(0);
    expect(calendarOutlook([event({}), event({ id: "6" })], "2026-03-08", 7, "America/New_York").overlaps).toHaveLength(
      1,
    );
  });
});
