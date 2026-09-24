import type { Collector, CollectorHealth, DemoSnapshot, RawAttentionSignal } from "@homebase/domain";

export * from "./career.js";
export * from "./career-salary.js";
export * from "./proxmox.js";
export * from "./security.js";
export * from "./games.js";
export * from "./family.js";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const signal = (input: Omit<RawAttentionSignal, "observedAt">, ageMinutes: number): RawAttentionSignal => ({
  ...input,
  observedAt: minutesAgo(ageMinutes),
});

export class MockFoundationCollector implements Collector<DemoSnapshot> {
  readonly name = "mock-foundation";

  async testConnection(): Promise<CollectorHealth> {
    const now = new Date().toISOString();
    return {
      state: "healthy",
      checkedAt: now,
      lastSuccessAt: now,
      latencyMs: 1,
      stale: false,
      message: "Deterministic demo snapshot available",
    };
  }

  async collect(): Promise<DemoSnapshot> {
    const health = await this.testConnection();
    const disabled = (message: string): CollectorHealth => ({
      state: "disabled",
      checkedAt: health.checkedAt,
      stale: false,
      message,
    });
    return {
      collectedAt: health.checkedAt,
      signals: [
        signal(
          {
            id: "career-detection-columbus",
            domain: "career",
            title: "$95k+ detection engineer role in Columbus",
            summary: "At least $25k above current base pay; aligns with SIEM, EDR, Splunk, and detection experience.",
            severity: "high",
            urgency: 82,
            relevance: 96,
            consequence: 78,
            recency: 94,
            confidence: 86,
            source: "Mock career feed",
            entity: "Detection Engineer · Buckeye Financial",
            action: { label: "Review match", href: "/career" },
          },
          184,
        ),
        signal(
          {
            id: "security-plex-kev",
            domain: "security",
            title: "Plex advisory requires review",
            summary:
              "Demo advisory matches the lab inventory and appears in the Known Exploited Vulnerabilities catalog.",
            severity: "critical",
            urgency: 94,
            relevance: 98,
            consequence: 90,
            recency: 86,
            confidence: 92,
            source: "Mock CISA KEV",
            entity: "Plex Media Server",
            action: { label: "Inspect advisory", href: "/security" },
          },
          47,
        ),
        signal(
          {
            id: "lab-docker-disk",
            domain: "lab",
            title: "Docker VM disk usage crossed 75%",
            summary: "Storage is at 78% and trending upward. Estimated headroom at the current rate: 19 days.",
            severity: "medium",
            urgency: 66,
            relevance: 96,
            consequence: 72,
            recency: 90,
            confidence: 99,
            source: "Mock homelab telemetry",
            entity: "debian-docker-01 / root",
            action: { label: "View storage", href: "/lab" },
          },
          12,
        ),
        signal(
          {
            id: "family-appointment",
            domain: "family",
            title: "Appointment tomorrow at 10:30",
            summary: "Leave by 09:55 to allow for normal traffic and parking.",
            severity: "medium",
            urgency: 76,
            relevance: 100,
            consequence: 58,
            recency: 80,
            confidence: 100,
            source: "Mock calendar",
            entity: "Family calendar",
            action: { label: "Open schedule", href: "/family" },
          },
          360,
        ),
        signal(
          {
            id: "games-holliday-patch",
            domain: "games",
            title: "Holliday changed in latest patch",
            summary: "Crackshot damage falloff changed; review the tracked build before the next match.",
            severity: "low",
            urgency: 38,
            relevance: 92,
            consequence: 34,
            recency: 88,
            confidence: 84,
            source: "Mock official patch feed",
            entity: "Deadlock · Holliday",
            action: { label: "Read change", href: "/games" },
          },
          720,
        ),
      ],
      today: [
        { id: "today-1", time: "08:30", title: "Daily operations review", meta: "15 min · Personal" },
        { id: "today-2", time: "13:00", title: "Certification study block", meta: "60 min · Career" },
        { id: "today-3", time: "18:30", title: "Household reset", meta: "30 min · Family" },
      ],
      statuses: [
        { domain: "lab", value: "97%", state: "warning" },
        { domain: "security", value: "2", state: "critical" },
        { domain: "career", value: "4", state: "healthy" },
        { domain: "family", value: "OK", state: "healthy" },
        { domain: "games", value: "PATCH", state: "warning" },
      ],
      focus: [
        { domain: "CAREER", title: "Complete current certification", progress: 68 },
        { domain: "LAB", title: "Harden infrastructure", progress: 42 },
        { domain: "PERSONAL", title: "Keep commitments handled", progress: 84 },
      ],
      changes: [
        { id: "change-1", age: "12m", source: "Docker storage", summary: "Usage increased 1.2% in 24h" },
        { id: "change-2", age: "47m", source: "Security feed", summary: "1 relevant advisory added" },
        { id: "change-3", age: "3h", source: "Career radar", summary: "4 strong-fit roles indexed" },
        { id: "change-4", age: "4h", source: "Plex library", summary: "2 episodes and 1 movie added" },
      ],
      lab: [
        { id: "cpu", label: "CPU", value: 18, unit: "%", status: "healthy" },
        { id: "memory", label: "Memory", value: 61, unit: "%", status: "healthy" },
        { id: "storage", label: "Storage", value: 78, unit: "%", status: "warning" },
        { id: "availability", label: "Services", value: 97, unit: "%", status: "healthy" },
      ],
      media: [
        { id: "plex-1", title: "The Last Horizon", detail: "movie", age: "1h ago" },
        { id: "plex-2", title: "Signal Lost", detail: "Deep Orbit", age: "4h ago" },
        { id: "plex-3", title: "Homecoming", detail: "Night Watch", age: "9h ago" },
      ],
      jobs: [
        {
          id: "job-1",
          title: "Detection Engineer",
          company: "Buckeye Financial",
          location: "Columbus, OH",
          arrangement: "hybrid",
          salary: "$95k–$118k",
          matchScore: 91,
          careerValueScore: 94,
          reasons: ["$25k+ above current pay", "Target Ohio market", "SIEM, EDR, Splunk"],
          gaps: [],
        },
        {
          id: "job-2",
          title: "Cybersecurity Analyst II",
          company: "Miami Valley Systems",
          location: "Dayton, OH",
          arrangement: "hybrid",
          salary: "$84k–$102k",
          matchScore: 86,
          careerValueScore: 88,
          reasons: ["Target Ohio market", "Incident response and EDR"],
          gaps: [],
        },
        {
          id: "job-3",
          title: "Security Operations Analyst",
          company: "Northstar Health",
          location: "Remote · US",
          arrangement: "remote",
          salary: "$88k–$110k",
          matchScore: 82,
          careerValueScore: 86,
          reasons: ["Remote", "Security engineering trajectory"],
          gaps: ["Confirm on-call expectations"],
        },
      ],
      games: [
        {
          id: "game-1",
          game: "League of Legends",
          title: "Patch 26.18 · Yunara",
          summary: "Base attack speed and two marksman items changed.",
          source: "Riot Games (demo)",
          tier: "official",
          affected: ["Yunara"],
        },
        {
          id: "game-2",
          game: "Deadlock",
          title: "September update · Holliday",
          summary: "Crackshot falloff changed; Pocket was unchanged.",
          source: "Valve (demo)",
          tier: "official",
          affected: ["Holliday", "Pocket"],
        },
        {
          id: "game-3",
          game: "League of Legends",
          title: "Yunara build response",
          summary: "Trusted analysis follows the official patch.",
          source: "Specialist source (demo)",
          tier: "trusted",
          affected: ["Yunara"],
        },
      ],
      family: [
        { id: "family-1", title: "Appointment tomorrow at 10:30", detail: "Leave by 09:55", state: "attention" },
        { id: "family-2", title: "Front door sensor battery", detail: "16% · replacement soon", state: "attention" },
        { id: "family-3", title: "Selected home devices", detail: "3 normal · mock snapshot", state: "normal" },
      ],
      integrations: [
        { key: "mock-foundation", name: "Foundation demo collector", mode: "mock", health },
        {
          key: "mock-calendar-stale",
          name: "Calendar stale-state demo",
          mode: "mock",
          health: {
            state: "degraded",
            checkedAt: health.checkedAt,
            lastSuccessAt: minutesAgo(18),
            latencyMs: 12,
            stale: true,
            message: "Last successful demo sync was 18 minutes ago",
          },
        },
        { key: "proxmox", name: "Proxmox", mode: "disabled", health: disabled("Deferred to Phase 1") },
        {
          key: "home-assistant",
          name: "Home Assistant",
          mode: "disabled",
          health: disabled("Real connection not configured"),
        },
        { key: "plex", name: "Plex", mode: "disabled", health: disabled("Real connection not configured") },
        { key: "calendar", name: "Calendar", mode: "disabled", health: disabled("Real connection not configured") },
        { key: "jobs", name: "Job sources", mode: "disabled", health: disabled("Real connection not configured") },
        { key: "games", name: "Game sources", mode: "disabled", health: disabled("Real connection not configured") },
      ],
    };
  }
}

export { ServiceCollector, parseKumaMetrics, type ServiceCollectorConfig } from "./services.js";
export {
  HomeSystemCollector,
  normalizeHomeAssistant,
  normalizePihole,
  normalizePlex,
  normalizeTailscale,
  type HomeSystemCollectorConfig,
} from "./home-systems.js";

export * from "./proxmox-pressure.js";
