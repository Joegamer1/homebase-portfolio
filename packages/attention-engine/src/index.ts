import type { AttentionDimensions, AttentionItem, RawAttentionSignal } from "@homebase/domain";

export const ATTENTION_WEIGHTS = {
  urgency: 0.3,
  relevance: 0.3,
  consequence: 0.2,
  recency: 0.1,
  confidence: 0.1,
} as const;
const clamp = (value: number) => Math.min(100, Math.max(0, value));

export function calculateAttentionScore(input: AttentionDimensions): number {
  const score = Object.entries(ATTENTION_WEIGHTS).reduce(
    (total, [key, weight]) => total + clamp(input[key as keyof AttentionDimensions]) * weight,
    0,
  );
  return Math.round(score * 10) / 10;
}

export function explainAttentionScore(input: AttentionDimensions): string {
  const factors = [
    [input.urgency, "urgent"],
    [input.relevance, "directly relevant"],
    [input.consequence, "high consequence"],
    [input.recency, "recent"],
    [input.confidence, "high confidence"],
  ] as const;
  const strongest = factors
    .filter(([value]) => value >= 75)
    .sort(([a], [b]) => b - a)
    .slice(0, 3)
    .map(([, label]) => label);
  if (!strongest.length) return "Ranked as routine based on the available signals.";
  if (strongest.length === 1) return `Ranked for being ${strongest[0]}.`;
  return `Ranked for being ${strongest.slice(0, -1).join(", ")} and ${strongest.at(-1)}.`;
}

export function rankAttention(signals: RawAttentionSignal[]): AttentionItem[] {
  return signals
    .map((signal) => ({
      ...signal,
      score: calculateAttentionScore(signal),
      explanation: explainAttentionScore(signal),
      firstSeen: signal.observedAt,
      lastSeen: signal.observedAt,
      status: "new" as const,
    }))
    .sort((a, b) => b.score - a.score || b.lastSeen.localeCompare(a.lastSeen));
}
