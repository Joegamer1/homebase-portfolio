import type { FamilyResponse } from "@homebase/api-contracts";
export type CalendarEvent = NonNullable<FamilyResponse["data"]["snapshot"]>["events"][number];

export function dateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function eventsOnDay(events: CalendarEvent[], day: string, timezone: string): CalendarEvent[] {
  return events
    .filter((event) => {
      if (event.cancelled) return false;
      if (event.allDay)
        return (
          event.startsAt.slice(0, 10) <= day &&
          (event.endsAt?.slice(0, 10) ?? addDays(event.startsAt.slice(0, 10), 1)) > day
        );
      const start = dateKey(new Date(event.startsAt), timezone);
      const end = dateKey(new Date(event.endsAt ? Date.parse(event.endsAt) - 1 : event.startsAt), timezone);
      return start <= day && end >= day;
    })
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt));
}
export function calendarOutlook(events: CalendarEvent[], start: string, days: number, timezone: string) {
  const daily = Array.from({ length: days }, (_, index) => {
    const day = addDays(start, index);
    return { day, events: eventsOnDay(events, day, timezone) };
  });
  const upcoming = [...new Map(daily.flatMap((day) => day.events).map((event) => [event.id, event])).values()];
  const timed = upcoming.filter((event) => !event.allDay && !event.stale && event.endsAt);
  const overlaps: Array<[CalendarEvent, CalendarEvent]> = [];
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i]!,
        b = timed[j]!;
      if (Date.parse(a.startsAt) < Date.parse(b.endsAt!) && Date.parse(b.startsAt) < Date.parse(a.endsAt!))
        overlaps.push([a, b]);
    }
  return {
    daily,
    upcoming,
    overlaps,
    busiest: [...daily].sort((a, b) => b.events.length - a.events.length)[0],
    clearDays: daily.filter((day) => !day.events.length).length,
  };
}
