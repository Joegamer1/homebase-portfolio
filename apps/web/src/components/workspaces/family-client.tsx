"use client";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/ui/page-heading";
import { ErrorState, LoadingState } from "@/components/ui/data-state";
import { fetchFamily, saveFamilyReminder } from "@/lib/api-client";
import type { FamilyResponse } from "@homebase/api-contracts";
import { FamilyCalendar } from "./family-calendar";
export function FamilyClient() {
  const [data, setData] = useState<FamilyResponse["data"]>();
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await fetchFamily();
        if (active) {
          setData(result.data);
          setError("");
        }
      } catch {
        if (active) setError("Family refresh failed. Showing last known data where available.");
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (!data && !error) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} />;
  const s = data!.snapshot;
  const add = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await saveFamilyReminder({ title: title.trim() });
      setTitle("");
      const next = await fetchFamily();
      setData(next.data);
    } catch {
      setSaveError("Could not save or refresh this reminder. Check the list before retrying.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <PageHeading
        eyebrow="Workspace / 06"
        title="Family"
        description="Household calendar events, upcoming commitments, and schedule insights."
      />
      {error && (
        <p role="alert" className="mb-4 text-sm text-[var(--amber)]">
          {error}
        </p>
      )}
      {!data?.configured && (
        <p className="mb-4 text-sm">Connect Home Assistant on the Homebase server to load household calendars.</p>
      )}
      {data?.configured && !s && (
        <p role="status" className="mb-4 text-sm">
          Waiting for the first calendar collection.
        </p>
      )}
      {s && <FamilyCalendar snapshot={error ? { ...s, stale: true } : s} />}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <details className="panel p-4">
          <summary className="cursor-pointer text-sm">Home devices</summary>

          {!s?.entities.length && <p className="mt-3 text-xs text-[var(--muted)]">No household entities selected.</p>}
          {s?.entities.map((e) => (
            <div key={e.id} className="flex justify-between border-b border-[var(--line)] py-3 text-xs">
              <span>
                {e.name}
                <span className="ml-2 text-[var(--muted)]">{e.area ?? e.kind}</span>
              </span>
              <span
                className={
                  e.state === "unavailable" || e.state === "unknown" ? "text-[var(--amber)]" : "text-[var(--green)]"
                }
              >
                {e.state}
              </span>
            </div>
          ))}
        </details>
        <details className="panel p-4 lg:col-span-2">
          <summary className="cursor-pointer text-sm">Reminders</summary>

          {saveError && (
            <p role="alert" className="mt-2 text-xs text-[var(--amber)]">
              {saveError}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <input
              aria-label="Reminder title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="add a local reminder"
              className="flex-1 border border-[var(--line)] bg-transparent px-3 py-2 text-xs"
            />
            <button
              type="button"
              disabled={saving || !title.trim()}
              onClick={() => void add()}
              className="border border-[var(--violet)] px-3 py-2 mono text-[9px]"
            >
              ADD
            </button>
          </div>
          {s?.reminders.map((r) => (
            <div key={r.id} className="flex justify-between border-b border-[var(--line)] py-3 text-xs">
              <span className={r.completed ? "line-through text-[var(--muted)]" : ""}>{r.title}</span>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setSaveError("");
                  try {
                    await saveFamilyReminder({ id: r.id, completed: !r.completed });
                    const next = await fetchFamily();
                    setData(next.data);
                  } catch {
                    setSaveError("Could not update or refresh this reminder.");
                  } finally {
                    setSaving(false);
                  }
                }}
                className="mono text-[9px] text-[var(--cyan)]"
              >
                {r.completed ? "REOPEN" : "COMPLETE"}
              </button>
            </div>
          ))}
        </details>
      </div>
    </div>
  );
}
