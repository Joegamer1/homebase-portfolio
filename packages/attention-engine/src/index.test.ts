import { describe, expect, it } from "vitest";
import { calculateAttentionScore, rankAttention } from "./index.js";

describe("attention engine", () => {
  it("uses the documented weights", () => {
    expect(calculateAttentionScore({ urgency: 100, relevance: 80, consequence: 60, recency: 40, confidence: 20 })).toBe(
      72,
    );
  });
  it("orders stronger signals first and explains them", () => {
    const base = {
      domain: "lab" as const,
      summary: "summary",
      severity: "high" as const,
      source: "mock",
      entity: "host",
      observedAt: "2026-09-07T12:00:00.000Z",
      urgency: 10,
      relevance: 10,
      consequence: 10,
      recency: 10,
      confidence: 10,
    };
    const result = rankAttention([
      { ...base, id: "low", title: "Low" },
      { ...base, id: "high", title: "High", urgency: 100, relevance: 100, confidence: 100 },
    ]);
    expect(result.map((item) => item.id)).toEqual(["high", "low"]);
    expect(result[0].explanation).toContain("directly relevant");
  });
});
