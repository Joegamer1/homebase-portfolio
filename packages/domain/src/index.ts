export const domains = ["lab", "security", "career", "games", "family", "system"] as const;
export type Domain = (typeof domains)[number];
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type AttentionStatus = "new" | "acknowledged" | "resolved" | "dismissed";

export interface AttentionDimensions {
  urgency: number;
  relevance: number;
  consequence: number;
  recency: number;
  confidence: number;
}

export interface RawAttentionSignal extends AttentionDimensions {
  id: string;
  domain: Domain;
  title: string;
  summary: string;
  severity: Severity;
  source: string;
  sourceUrl?: string;
  entity: string;
  observedAt: string;
  action?: { label: string; href: string };
}

export interface AttentionItem extends RawAttentionSignal {
  score: number;
  explanation: string;
  firstSeen: string;
  lastSeen: string;
  status: AttentionStatus;
}

export interface CollectorHealth {
  ageSeconds?: number;
  nextRefreshAt?: string;
  state: "healthy" | "degraded" | "down" | "disabled";
  checkedAt: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  latencyMs?: number;
  stale: boolean;
  message?: string;
}

export interface Collector<T> {
  readonly name: string;
  testConnection(): Promise<CollectorHealth>;
  collect(): Promise<T>;
}

export interface ProxmoxNode {
  id: string;
  name: string;
  status: "online" | "offline" | "unknown";
  uptimeSeconds: number;
  cpuUsagePercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
}

export interface ProxmoxWorkload {
  id: string;
  vmid: number;
  name: string;
  kind: "qemu" | "lxc";
  node: string;
  status: string;
  uptimeSeconds: number;
  cpuUsagePercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  expectedDown: boolean;
}

export interface ProxmoxStorage {
  id: string;
  name: string;
  node?: string;
  status: string;
  usedBytes: number;
  totalBytes: number;
  usagePercent: number;
}

export interface ProxmoxFailedTask {
  id: string;
  node: string;
  type: string;
  status: string;
  user?: string;
  startedAt: string;
  endedAt?: string;
}

export interface ProxmoxSnapshot {
  source: "proxmox";
  collectedAt: string;
  stale: boolean;
  nodes: ProxmoxNode[];
  workloads: ProxmoxWorkload[];
  storage: ProxmoxStorage[];
  failedTasks: ProxmoxFailedTask[];
  signals: RawAttentionSignal[];
}

export interface DemoSnapshot {
  collectedAt: string;
  signals: RawAttentionSignal[];
  today: Array<{ id: string; time: string; title: string; meta: string }>;
  statuses: Array<{ domain: Domain; value: string; state: "healthy" | "warning" | "critical" }>;
  focus: Array<{ domain: string; title: string; progress: number }>;
  changes: Array<{ id: string; age: string; source: string; summary: string }>;
  lab: Array<{ id: string; label: string; value: number; unit: string; status: "healthy" | "warning" | "critical" }>;
  media: Array<{ id: string; title: string; detail: string; age: string }>;
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    arrangement: string;
    salary: string;
    matchScore: number;
    careerValueScore: number;
    reasons: string[];
    gaps: string[];
  }>;
  games: Array<{
    id: string;
    game: string;
    title: string;
    summary: string;
    source: string;
    tier: "official" | "trusted" | "community";
    affected: string[];
  }>;
  family: Array<{ id: string; title: string; detail: string; state: "normal" | "attention" }>;
  integrations: Array<{ key: string; name: string; mode: "mock" | "live" | "disabled"; health: CollectorHealth }>;
}

export interface ServiceRecord {
  id: string;
  name: string;
  state: string;
  health: string;
  image?: string;
  uptimeSeconds?: number;
  restartCount?: number;
  latencyMs?: number;
  expectedDown: boolean;
}
export interface ServiceSnapshot {
  source: "docker" | "uptime-kuma";
  collectedAt: string;
  stale: boolean;
  services: ServiceRecord[];
  signals: RawAttentionSignal[];
}

export type HomeSystemSource = "pihole" | "plex" | "home-assistant" | "tailscale";

export type GameName = "league-of-legends" | "deadlock";
export type GameUpdateCategory = "ability" | "stats" | "item" | "mechanic" | "ranked" | "bug-fix" | "other";
export interface GameUpdateRecord {
  id: string;
  game: GameName;
  gameLabel: string;
  patch: string;
  title: string;
  entity?: string;
  entityId?: string;
  category: GameUpdateCategory;
  classification: "buff" | "nerf" | "mixed" | "unclear";
  summary: string;
  confirmedChange: string;
  gameplayImplication?: string;
  source: string;
  sourceUrl?: string;
  publishedAt: string;
  collectedAt: string;
  relevanceTier: 1 | 2 | 3 | 4 | 5;
  relevanceReason: string;
  saved: boolean;
  read: boolean;
  dismissed: boolean;
  note?: string;
}
export interface GameProfile {
  tracked: Array<{ game: GameName; entityId: string; name: string; kind: "champion" | "hero" | "item" | "system" }>;
  queues: string[];
  roles: string[];
}
export interface GameSnapshot {
  source: "games";
  collectedAt: string;
  stale: boolean;
  configured: boolean;
  profile: GameProfile;
  updates: GameUpdateRecord[];
  providers: Array<{
    source: string;
    game: GameName;
    state: "healthy" | "degraded" | "down" | "disabled";
    itemCount: number;
    message?: string;
  }>;
  signals: RawAttentionSignal[];
}

export interface FamilyEvent {
  stale?: boolean;
  id: string;
  externalId: string;
  calendarId: string;
  calendarLabel: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  timezone?: string;
  location?: string;
  source: "home-assistant" | "local";
  updatedAt?: string;
  cancelled?: boolean;
}
export interface FamilyEntity {
  id: string;
  entityId: string;
  name: string;
  kind: string;
  deviceClass?: string;
  state: string;
  unit?: string;
  area?: string;
  lastChangedAt?: string;
  collectedAt: string;
  stale: boolean;
  attention?: { id: string; title: string; detail: string; acknowledged: boolean };
}
export interface FamilySnapshot {
  coverageStart?: string;
  coverageEnd?: string;
  source: "family";
  collectedAt: string;
  stale: boolean;
  configured: boolean;
  timezone: string;
  events: FamilyEvent[];
  entities: FamilyEntity[];
  reminders: Array<{ id: string; title: string; dueAt?: string; completed: boolean; updatedAt: string }>;
  selectedCalendars: Array<{ id: string; label: string }>;
  selectedEntities: Array<{ id: string; label: string; area?: string }>;
  capabilities: { calendars: boolean; entities: boolean; reminders: boolean };
  providers: Array<{ source: string; state: "healthy" | "degraded" | "down" | "disabled"; message?: string }>;
  signals: RawAttentionSignal[];
}

export interface HomeSystemMetric {
  key: string;
  label: string;
  value: string;
  state: "healthy" | "warning" | "critical" | "neutral";
}

export interface HomeSystemEntity {
  id: string;
  name: string;
  kind: string;
  state: string;
  detail?: string;
}

export interface HomeSystemSnapshot {
  source: HomeSystemSource;
  collectedAt: string;
  stale: boolean;
  version?: string;
  metrics: HomeSystemMetric[];
  entities: HomeSystemEntity[];
  signals: RawAttentionSignal[];
}

export type SecurityClassification = "affects-lab" | "career-relevant" | "general-high-signal";

export interface TrackedTechnology {
  id: string;
  product: string;
  vendor?: string;
  version?: string;
  source: string;
  confidence: number;
  enabled: boolean;
  aliases: string[];
}

export interface AdvisoryTechnologyMatch {
  versionAssessment?: "version-affected" | "version-not-affected" | "unknown";
  technologyId: string;
  product: string;
  installedVersion?: string;
  confidence: number;
  explanation: string;
}

export interface SecurityAdvisoryRecord {
  stale?: boolean;
  id: string;
  cveId: string;
  title: string;
  summary: string;
  severity: Severity;
  cvssScore?: number;
  knownExploited: boolean;
  ransomwareUse: "known" | "unknown";
  classification: SecurityClassification;
  publishedAt?: string;
  updatedAt?: string;
  dateAddedToKev?: string;
  dueDate?: string;
  requiredAction?: string;
  sourceUrl: string;
  sources: string[];
  matches: AdvisoryTechnologyMatch[];
}

export interface SecuritySnapshot {
  source: "security-intelligence";
  collectedAt: string;
  stale: boolean;
  catalogVersion?: string;
  feeds: Array<{
    source: "cisa-kev" | "nvd";
    stale?: boolean;
    complete?: boolean;
    lastSuccessAt?: string;
    windowStart?: string;
    state: "healthy" | "down";
    itemCount: number;
    eligibleCount?: number;
    message?: string;
  }>;
  technologies: TrackedTechnology[];
  advisories: SecurityAdvisoryRecord[];
  signals: RawAttentionSignal[];
}

export type JobArrangement = "remote" | "hybrid" | "onsite" | "unknown";
export type JobStatus = "new" | "saved" | "applied" | "dismissed";

export interface CareerProfile {
  id: string;
  name: string;
  currentSalary: number;
  minimumSalary: number;
  preferredSalary: number;
  locations: string[];
  allowRemote: boolean;
  targetTitles: string[];
  targetSkills: string[];
  advancementTerms: string[];
  regressionTerms: string[];
}

export interface CareerJobDraft {
  externalId: string;
  title: string;
  company: string;
  location: string;
  arrangement: JobArrangement;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryEstimated?: boolean;
  salaryEstimateSource?: string;
  description: string;
  source: string;
  sourceUrl?: string;
  postedAt?: string;
}

export interface CareerJob extends CareerJobDraft {
  fitLevel?: "Strong Fit" | "Stretch Fit" | "Likely Too Senior";
  cloudTrack?: "Cloud Security" | "Cloud Engineering" | "IAM" | "DevSecOps" | "Detection / SecOps";
  stale?: boolean;
  available?: boolean;
  availabilityCheckedAt?: string;
  availabilityReason?: string;
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: JobStatus;
  requiredSkills: string[];
  preferredSkills: string[];
  matchScore: number;
  careerValueScore: number;
  reasons: string[];
  gaps: string[];
}

export interface CareerSkillTrend {
  skill: string;
  currentWeek: number;
  previousWeek: number;
  delta: number;
}

export interface CareerSnapshot {
  source: "career-radar";
  collectedAt: string;
  stale: boolean;
  profile: CareerProfile;
  providers: Array<{
    source: string;
    state: "healthy" | "down" | "disabled";
    itemCount: number;
    eligibleCount?: number;
    message?: string;
  }>;
  jobs: CareerJob[];
  skillTrends: CareerSkillTrend[];
  signals: RawAttentionSignal[];
}

export interface JobProvider {
  readonly name: string;
  collectedAt?: string;
  collect(includeAll?: boolean): Promise<CareerJobDraft[]>;
}
