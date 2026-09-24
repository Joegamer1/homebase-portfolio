import { afterEach, expect, it, vi } from "vitest";
import { startScheduler } from "./scheduler.js";
afterEach(() => vi.useRealTimers());
it("schedules independent jobs, prevents overlap, recovers from errors, and stops", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const slow = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const fast = vi.fn().mockRejectedValueOnce(new Error("outage")).mockResolvedValue(undefined);
  const errors = vi.fn();
  const stop = startScheduler(
    [
      { name: "slow", intervalMs: 100, run: slow },
      { name: "fast", intervalMs: 10, run: fast },
    ],
    errors,
  );
  await vi.advanceTimersByTimeAsync(250);
  expect(slow).toHaveBeenCalledTimes(1);
  expect(fast.mock.calls.length).toBeGreaterThan(10);
  expect(errors).toHaveBeenCalledTimes(1);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  const count = fast.mock.calls.length;
  await stop();
  await vi.advanceTimersByTimeAsync(1000);
  expect(fast).toHaveBeenCalledTimes(count);
  expect(slow).toHaveBeenCalledTimes(1);
});
