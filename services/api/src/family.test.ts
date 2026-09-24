import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  familySelection: { findMany: vi.fn().mockResolvedValue([]) },
  familyReminder: { findMany: vi.fn().mockResolvedValue([]) },
  integrationSnapshot: { findUnique: vi.fn(), upsert: vi.fn() },
  integration: { upsert: vi.fn() },
}));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      return mocks;
    }
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("discovers every calendar without selections and retains a failed calendar's prior events", async () => {
  vi.stubEnv("HOME_ASSISTANT_BASE_URL", "http://ha.test");
  vi.stubEnv("HOME_ASSISTANT_TOKEN", "test-only");
  let failed = false;
  const request = vi.fn(async (url: string) => {
    if (url.endsWith("/api/calendars"))
      return Response.json([
        { entity_id: "calendar.sample", name: "Sample local" },
        { entity_id: "calendar.google", name: "Google" },
      ]);
    if (failed && url.includes("calendar.sample")) return new Response("", { status: 503 });
    return Response.json([
      {
        summary: "Shift",
        start: { dateTime: "2026-09-17T08:00:00-04:00" },
        end: { dateTime: "2026-09-17T16:00:00-04:00" },
      },
    ]);
  });
  vi.stubGlobal("fetch", request);
  const { collectFamily } = await import("./family.js");
  const first = await collectFamily();
  expect(first.data.snapshot?.selectedCalendars).toHaveLength(2);
  expect(first.data.snapshot?.events).toHaveLength(2);
  expect(first.data.health.state).toBe("healthy");
  expect(Date.parse(first.data.snapshot!.coverageEnd!) - Date.now()).toBeGreaterThan(61 * 86400000);
  mocks.integrationSnapshot.findUnique.mockResolvedValue({ payload: first.data.snapshot });
  failed = true;
  const partial = await collectFamily();
  expect(partial.data.health.state).toBe("degraded");
  expect(partial.data.snapshot?.events.find((e) => e.calendarId === "calendar.sample")?.stale).toBe(true);
  expect(partial.data.snapshot?.events.find((e) => e.calendarId === "calendar.google")?.stale).not.toBe(true);
  expect(partial.data.snapshot?.events).toHaveLength(2);
  failed = false;
  expect((await collectFamily()).data.health.state).toBe("healthy");
  request.mockRejectedValue(new Error("Home Assistant temporarily unavailable"));
  const outage = await collectFamily();
  expect(outage.data.snapshot?.collectedAt).toBe(first.data.snapshot?.collectedAt);
  expect(outage.data.snapshot?.events.every((event) => event.stale)).toBe(true);
  expect(outage.data.health.state).toBe("degraded");
});

it("excludes Donetick chore calendars from the household agenda", async () => {
  vi.stubEnv("HOME_ASSISTANT_BASE_URL", "http://ha.test");
  vi.stubEnv("HOME_ASSISTANT_TOKEN", "test-only");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/api/calendars"))
        return Response.json([
          { entity_id: "calendar.family", name: "Family" },
          { entity_id: "calendar.donetick_chores_chores", name: "Donetick Chores" },
          { entity_id: "calendar.donetick_chores_activity_log", name: "Donetick Chores Activity Log" },
        ]);
      return Response.json([
        {
          summary: "Appointment",
          start: { dateTime: "2026-09-18T10:00:00-04:00" },
          end: { dateTime: "2026-09-18T11:00:00-04:00" },
        },
      ]);
    }),
  );
  const { collectFamily } = await import("./family.js");
  const result = await collectFamily();
  expect(result.data.snapshot?.selectedCalendars.map((calendar) => calendar.id)).toEqual(["calendar.family"]);
  expect(result.data.snapshot?.events).toHaveLength(1);
});
