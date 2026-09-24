"use client";
import { useState } from "react";
import type { FamilyResponse } from "@homebase/api-contracts";
import { addDays, calendarOutlook, dateKey } from "@/lib/family-calendar";
type Snapshot = NonNullable<FamilyResponse["data"]["snapshot"]>;
export function FamilyCalendar({ snapshot }: { snapshot: Snapshot }) {
  const today = dateKey(new Date(), snapshot.timezone);
  const [hidden, setHidden] = useState<string[]>([]);
  const outlook = calendarOutlook(
    snapshot.events.filter((event) => !hidden.includes(event.calendarId)),
    today,
    7,
    snapshot.timezone,
  );
  const covered = Boolean(
    snapshot.coverageStart &&
      snapshot.coverageEnd &&
      today > snapshot.coverageStart.slice(0, 10) &&
      addDays(today, 6) < snapshot.coverageEnd.slice(0, 10),
  );
  const label = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const time = (value: string) =>
    new Date(value).toLocaleTimeString("en-US", { timeZone: snapshot.timezone, hour: "numeric", minute: "2-digit" });
  return (
    <section className="panel mb-6 p-4" aria-label="Family outlook">
      <h2 className="text-lg font-semibold">Next 7 days</h2>
      {snapshot.stale || !covered ? (
        <p role="status" className="mt-2 text-sm text-[var(--amber)]">
          Calendar updates are incomplete. Some events may be missing.
        </p>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {outlook.busiest && outlook.busiest.events.length > 1
            ? `${label(outlook.busiest.day)} is busiest with ${outlook.busiest.events.length} events.`
            : outlook.upcoming.length
              ? "A light week ahead."
              : "No events scheduled this week."}
          {outlook.upcoming.length > 0 && outlook.clearDays > 0
            ? ` ${outlook.clearDays} ${outlook.clearDays === 1 ? "day has" : "days have"} no scheduled events.`
            : ""}
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {outlook.daily.map(({ day, events }) => (
          <section key={day} className="rounded-lg border border-[var(--line)] p-3">
            <h3 className={`text-sm font-medium ${day === today ? "text-[var(--cyan)]" : ""}`}>
              {day === today ? "Today" : label(day)}
            </h3>
            <ul className="mt-3 space-y-3">
              {events.map((event) => (
                <li key={event.id}>
                  <details>
                    <summary className="cursor-pointer text-sm">
                      <span className="block text-xs text-[var(--muted)]">
                        {event.allDay ? "All day" : time(event.startsAt)}
                      </span>
                      {event.title}
                      {event.stale && <span className="block text-xs text-[var(--amber)]">May be out of date</span>}
                    </summary>
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      {!event.allDay && event.endsAt && <p>Until {time(event.endsAt)}</p>}
                      {event.location && <p>{event.location}</p>}
                      <p>{event.calendarLabel}</p>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            {!events.length && (
              <p className="mt-3 text-xs text-[var(--muted)]">
                {covered && !snapshot.stale ? "No events" : "No events loaded"}
              </p>
            )}
          </section>
        ))}
      </div>
      <details className="mt-4 text-xs text-[var(--muted)]">
        <summary className="cursor-pointer">
          Choose calendars{hidden.length ? ` (${hidden.length} hidden)` : ""}
        </summary>
        <fieldset className="mt-3 flex flex-wrap gap-3">
          <legend className="sr-only">Visible calendars</legend>
          {snapshot.selectedCalendars.map((calendar) => (
            <label key={calendar.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!hidden.includes(calendar.id)}
                onChange={() =>
                  setHidden(
                    hidden.includes(calendar.id) ? hidden.filter((id) => id !== calendar.id) : [...hidden, calendar.id],
                  )
                }
              />
              {calendar.label}
            </label>
          ))}
        </fieldset>
      </details>
    </section>
  );
}
