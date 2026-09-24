import { expect, it } from "vitest";
import type { ProxmoxSnapshot } from "@homebase/domain";
import { evaluateProxmoxPressure, type PressureState } from "./proxmox-pressure.js";
const thresholds = { cpuWarningPercent: 90, memoryWarningPercent: 90 };
const snapshot = (minute: number, usage = 95): ProxmoxSnapshot => ({
  source: "proxmox",
  stale: false,
  collectedAt: new Date(Date.UTC(2026, 8, 18, 0, minute)).toISOString(),
  nodes: [
    {
      id: "node/one",
      name: "one",
      status: "online",
      uptimeSeconds: 1000,
      cpuUsagePercent: usage,
      memoryUsedBytes: usage,
      memoryTotalBytes: 100,
    },
  ],
  workloads: [],
  storage: [],
  failedTasks: [],
  signals: [],
});
it("requires sustained pressure, survives serialized state, and recovers with hysteresis", () => {
  let previous: PressureState | undefined;
  for (let minute = 0; minute <= 3; minute++) {
    const result = evaluateProxmoxPressure(snapshot(minute), thresholds, previous);
    expect(result.signals).toHaveLength(minute === 3 ? 2 : 0);
    previous = JSON.parse(JSON.stringify(result.state));
  }
  const stable = evaluateProxmoxPressure(snapshot(4, 87), thresholds, previous);
  expect(stable.signals).toHaveLength(2);
  expect(stable.signals[0]?.observedAt).toBe(snapshot(0).collectedAt);
  const recovered = evaluateProxmoxPressure(snapshot(5, 84), thresholds, stable.state);
  expect(recovered.signals).toEqual([]);
  expect(evaluateProxmoxPressure(snapshot(6), thresholds, recovered.state).signals).toEqual([]);
});
it("resets interrupted samples, stopped resources, and unknown memory capacity", () => {
  const previous = evaluateProxmoxPressure(snapshot(0), thresholds).state;
  expect(evaluateProxmoxPressure(snapshot(4), thresholds, previous).signals).toEqual([]);
  const missing = snapshot(1);
  missing.nodes[0]!.memoryTotalBytes = 0;
  expect(Object.keys(evaluateProxmoxPressure(missing, thresholds, previous).state.metrics)).toHaveLength(1);
  missing.nodes[0]!.status = "offline";
  expect(evaluateProxmoxPressure(missing, thresholds, previous).state.metrics).toEqual({});
});
