import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
const mocks = vi.hoisted(() => ({
  integrationSnapshot: { findUnique: vi.fn() },
  integration: { findUnique: vi.fn() },
}));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      return mocks;
    }
  },
}));
const schema = z.object({ collectedAt: z.iso.datetime(), stale: z.boolean(), signals: z.array(z.unknown()) });
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("reads persisted data without collection and marks stopped-worker data overdue", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  const date = new Date();
  mocks.integrationSnapshot.findUnique.mockResolvedValue({
    payload: { collectedAt: date.toISOString(), stale: false, signals: [] },
  });
  mocks.integration.findUnique.mockResolvedValue({
    health: { state: "HEALTHY", lastAttemptAt: date, lastSuccessAt: date },
  });
  const { readSnapshot } = await import("./snapshot-reader.js");
  expect((await readSnapshot("test", schema, 60)).health).toMatchObject({ state: "healthy", ageSeconds: 0 });
  vi.advanceTimersByTime(121000);
  const result = await readSnapshot("test", schema, 60);
  expect(result.health).toMatchObject({ state: "degraded", stale: true, ageSeconds: 121 });
  expect(result.snapshot?.stale).toBe(true);
});
it("returns a waiting state for missing/malformed snapshots and does no reads when disabled", async () => {
  const { readSnapshot } = await import("./snapshot-reader.js");
  const disabled = await readSnapshot("test", schema, 60, false);
  expect(disabled.health.state).toBe("disabled");
  expect(mocks.integrationSnapshot.findUnique).not.toHaveBeenCalled();
  mocks.integrationSnapshot.findUnique.mockResolvedValue({ payload: {} });
  expect((await readSnapshot("test", schema, 60)).health.state).toBe("down");
});
