import { z } from "zod";

const isoDate = z.iso.datetime();
const healthSchema = z.object({
  ageSeconds: z.number().nonnegative().optional(),
  nextRefreshAt: isoDate.optional(),
  state: z.enum(["healthy", "degraded", "down", "disabled"]),
  checkedAt: isoDate,
  lastAttemptAt: isoDate.optional(),
  lastSuccessAt: isoDate.optional(),
  lastError: z.string().optional(),
  latencyMs: z.number().nonnegative().optional(),
  stale: z.boolean(),
  message: z.string().optional(),
});

export const attentionItemSchema = z.object({
  id: z.string(),
  domain: z.enum(["lab", "security", "career", "games", "family", "system"]),
  title: z.string(),
  summary: z.string(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  urgency: z.number().min(0).max(100),
  relevance: z.number().min(0).max(100),
  consequence: z.number().min(0).max(100),
  recency: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  score: z.number().min(0).max(100),
  explanation: z.string(),
  source: z.string(),
  sourceUrl: z.string().url().optional(),
  entity: z.string(),
  observedAt: isoDate,
  firstSeen: isoDate,
  lastSeen: isoDate,
  status: z.enum(["new", "acknowledged", "resolved", "dismissed"]),
  action: z.object({ label: z.string(), href: z.string() }).optional(),
});

export const integrationSchema = z.object({
  key: z.string(),
  name: z.string(),
  mode: z.enum(["mock", "live", "disabled"]),
  health: healthSchema,
});

const proxmoxNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["online", "offline", "unknown"]),
  uptimeSeconds: z.number().nonnegative(),
  cpuUsagePercent: z.number().min(0).max(100),
  memoryUsedBytes: z.number().nonnegative(),
  memoryTotalBytes: z.number().nonnegative(),
});
const proxmoxWorkloadSchema = z.object({
  id: z.string(),
  vmid: z.number().int(),
  name: z.string(),
  kind: z.enum(["qemu", "lxc"]),
  node: z.string(),
  status: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  cpuUsagePercent: z.number().min(0).max(100),
  memoryUsedBytes: z.number().nonnegative(),
  memoryTotalBytes: z.number().nonnegative(),
  expectedDown: z.boolean(),
});
const proxmoxStorageSchema = z.object({
  id: z.string(),
  name: z.string(),
  node: z.string().optional(),
  status: z.string(),
  usedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  usagePercent: z.number().min(0).max(100),
});
const proxmoxTaskSchema = z.object({
  id: z.string(),
  node: z.string(),
  type: z.string(),
  status: z.string(),
  user: z.string().optional(),
  startedAt: isoDate,
  endedAt: isoDate.optional(),
});
export const proxmoxSnapshotSchema = z.object({
  source: z.literal("proxmox"),
  collectedAt: isoDate,
  stale: z.boolean(),
  nodes: z.array(proxmoxNodeSchema),
  workloads: z.array(proxmoxWorkloadSchema),
  storage: z.array(proxmoxStorageSchema),
  failedTasks: z.array(proxmoxTaskSchema),
  signals: z.array(attentionItemSchema),
});
export const proxmoxResponseSchema = z.object({
  data: z.object({ configured: z.boolean(), health: healthSchema, snapshot: proxmoxSnapshotSchema.nullable() }),
});

const statusSchema = z.object({
  domain: z.enum(["lab", "security", "career", "games", "family", "system"]),
  value: z.string(),
  state: z.enum(["healthy", "warning", "critical"]),
});
const homePayloadShape = {
  generatedAt: isoDate,
  mode: z.enum(["mock", "mixed", "live"]),
  stale: z.boolean(),
  attention: z.array(attentionItemSchema),
  today: z.array(z.object({ id: z.string(), time: z.string(), title: z.string(), meta: z.string() })),
  calendarOutlook: z
    .object({
      nextSevenDaysCount: z.number().int().nonnegative(),
      nextEvent: z.string().optional(),
      stale: z.boolean(),
    })
    .optional(),
  statuses: z.array(statusSchema),
  focus: z.array(z.object({ domain: z.string(), title: z.string(), progress: z.number().min(0).max(100) })),
  changes: z.array(z.object({ id: z.string(), age: z.string(), source: z.string(), summary: z.string() })),
  lab: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.number(),
      unit: z.string(),
      source: z.string().optional(),
      collectedAt: isoDate.optional(),
      stale: z.boolean().optional(),
      status: z.enum(["healthy", "warning", "critical"]),
    }),
  ),
  media: z.array(z.object({ id: z.string(), title: z.string(), detail: z.string(), age: z.string() })),
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      company: z.string(),
      location: z.string(),
      arrangement: z.string(),
      salary: z.string(),
      matchScore: z.number(),
      careerValueScore: z.number(),
      reasons: z.array(z.string()),
      gaps: z.array(z.string()),
    }),
  ),
  games: z.array(
    z.object({
      id: z.string(),
      game: z.string(),
      title: z.string(),
      summary: z.string(),
      source: z.string(),
      tier: z.enum(["official", "trusted", "community"]),
      affected: z.array(z.string()),
    }),
  ),
  family: z.array(
    z.object({ id: z.string(), title: z.string(), detail: z.string(), state: z.enum(["normal", "attention"]) }),
  ),
  integrations: z.array(integrationSchema),
};

export const homeResponseSchema = z.object({ data: z.object(homePayloadShape) });
export const attentionResponseSchema = z.object({
  data: z.object({ generatedAt: isoDate, stale: z.boolean(), items: z.array(attentionItemSchema) }),
});
export const integrationsResponseSchema = z.object({
  data: z.object({ generatedAt: isoDate, integrations: z.array(integrationSchema) }),
});
const gameUpdateSchema = z.object({
  id: z.string(),
  game: z.enum(["league-of-legends", "deadlock"]),
  gameLabel: z.string(),
  patch: z.string(),
  title: z.string(),
  entity: z.string().optional(),
  entityId: z.string().optional(),
  category: z.enum(["ability", "stats", "item", "mechanic", "ranked", "bug-fix", "other"]),
  classification: z.enum(["buff", "nerf", "mixed", "unclear"]),
  summary: z.string(),
  confirmedChange: z.string(),
  gameplayImplication: z.string().optional(),
  source: z.string(),
  sourceUrl: z.string().url().optional(),
  publishedAt: isoDate,
  collectedAt: isoDate,
  relevanceTier: z.number().int().min(1).max(5),
  relevanceReason: z.string(),
  saved: z.boolean(),
  read: z.boolean(),
  dismissed: z.boolean(),
  note: z.string().optional(),
});
const familyEventSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  calendarId: z.string(),
  calendarLabel: z.string(),
  title: z.string(),
  startsAt: isoDate,
  endsAt: isoDate.optional(),
  allDay: z.boolean(),
  timezone: z.string().optional(),
  location: z.string().optional(),
  source: z.enum(["home-assistant", "local"]),
  updatedAt: isoDate.optional(),
  cancelled: z.boolean().optional(),
  stale: z.boolean().optional(),
});
const familyEntitySchema = z.object({
  id: z.string(),
  entityId: z.string(),
  name: z.string(),
  kind: z.string(),
  deviceClass: z.string().optional(),
  state: z.string(),
  unit: z.string().optional(),
  area: z.string().optional(),
  lastChangedAt: isoDate.optional(),
  collectedAt: isoDate,
  stale: z.boolean(),
  attention: z.object({ id: z.string(), title: z.string(), detail: z.string(), acknowledged: z.boolean() }).optional(),
});
const sourceStateSchema = z.object({
  source: z.string(),
  state: z.enum(["healthy", "degraded", "down", "disabled"]),
  itemCount: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
});
export const gameSnapshotSchema = z.object({
  source: z.literal("games"),
  collectedAt: isoDate,
  stale: z.boolean(),
  configured: z.boolean(),
  profile: z.object({
    tracked: z.array(
      z.object({
        game: z.enum(["league-of-legends", "deadlock"]),
        entityId: z.string(),
        name: z.string(),
        kind: z.enum(["champion", "hero", "item", "system"]),
      }),
    ),
    queues: z.array(z.string()),
    roles: z.array(z.string()),
  }),
  updates: z.array(gameUpdateSchema),
  providers: z.array(sourceStateSchema),
  signals: z.array(attentionItemSchema),
});
export const gamesResponseSchema = z.object({
  data: z.object({ configured: z.boolean(), health: healthSchema, snapshot: gameSnapshotSchema.nullable() }),
});
export const familySnapshotSchema = z.object({
  coverageStart: isoDate.optional(),
  coverageEnd: isoDate.optional(),
  source: z.literal("family"),
  collectedAt: isoDate,
  stale: z.boolean(),
  configured: z.boolean(),
  timezone: z.string(),
  events: z.array(familyEventSchema),
  entities: z.array(familyEntitySchema),
  reminders: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      dueAt: isoDate.optional(),
      completed: z.boolean(),
      updatedAt: isoDate,
    }),
  ),
  selectedCalendars: z.array(z.object({ id: z.string(), label: z.string() })),
  selectedEntities: z.array(z.object({ id: z.string(), label: z.string(), area: z.string().optional() })),
  capabilities: z.object({ calendars: z.boolean(), entities: z.boolean(), reminders: z.boolean() }),
  providers: z.array(sourceStateSchema),
  signals: z.array(attentionItemSchema),
});
export const familyResponseSchema = z.object({
  data: z.object({ configured: z.boolean(), health: healthSchema, snapshot: familySnapshotSchema.nullable() }),
});
export type GamesResponse = z.infer<typeof gamesResponseSchema>;
export type FamilyResponse = z.infer<typeof familyResponseSchema>;
export const healthResponseSchema = z.object({
  data: z.object({
    service: z.literal("homebase-api"),
    status: z.literal("ok"),
    version: z.literal("v1"),
    checkedAt: isoDate,
  }),
});
export const errorResponseSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export type HomeResponse = z.infer<typeof homeResponseSchema>;
export type AttentionItem = z.infer<typeof attentionItemSchema>;
export type Integration = z.infer<typeof integrationSchema>;
export type ProxmoxResponse = z.infer<typeof proxmoxResponseSchema>;

export const serviceSnapshotSchema = z.object({
  source: z.enum(["docker", "uptime-kuma"]),
  collectedAt: isoDate,
  stale: z.boolean(),
  services: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      state: z.string(),
      health: z.string(),
      image: z.string().optional(),
      uptimeSeconds: z.number().nonnegative().optional(),
      restartCount: z.number().int().nonnegative().optional(),
      latencyMs: z.number().nonnegative().optional(),
      expectedDown: z.boolean(),
    }),
  ),
  signals: z.array(attentionItemSchema),
});
export const serviceResponseSchema = z.object({
  data: z.object({ configured: z.boolean(), health: healthSchema, snapshot: serviceSnapshotSchema.nullable() }),
});
export type ServiceResponse = z.infer<typeof serviceResponseSchema>;

export const homeSystemSourceSchema = z.enum(["pihole", "plex", "home-assistant", "tailscale"]);
export const homeSystemSnapshotSchema = z.object({
  source: homeSystemSourceSchema,
  collectedAt: isoDate,
  stale: z.boolean(),
  version: z.string().optional(),
  metrics: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: z.string(),
      state: z.enum(["healthy", "warning", "critical", "neutral"]),
    }),
  ),
  entities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      state: z.string(),
      detail: z.string().optional(),
    }),
  ),
  signals: z.array(attentionItemSchema),
});
export const homeSystemResponseSchema = z.object({
  data: z.object({ configured: z.boolean(), health: healthSchema, snapshot: homeSystemSnapshotSchema.nullable() }),
});
export type HomeSystemResponse = z.infer<typeof homeSystemResponseSchema>;

const trackedTechnologySchema = z.object({
  id: z.string(),
  product: z.string(),
  vendor: z.string().optional(),
  version: z.string().optional(),
  source: z.string(),
  confidence: z.number().min(0).max(100),
  enabled: z.boolean(),
  aliases: z.array(z.string()),
});

const advisoryTechnologyMatchSchema = z.object({
  versionAssessment: z.enum(["version-affected", "version-not-affected", "unknown"]).optional(),
  technologyId: z.string(),
  product: z.string(),
  installedVersion: z.string().optional(),
  confidence: z.number().min(0).max(100),
  explanation: z.string(),
});

const securityAdvisorySchema = z.object({
  stale: z.boolean().optional(),
  id: z.string(),
  cveId: z.string(),
  title: z.string(),
  summary: z.string(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]),
  cvssScore: z.number().min(0).max(10).optional(),
  knownExploited: z.boolean(),
  ransomwareUse: z.enum(["known", "unknown"]),
  classification: z.enum(["affects-lab", "career-relevant", "general-high-signal"]),
  publishedAt: isoDate.optional(),
  updatedAt: isoDate.optional(),
  dateAddedToKev: isoDate.optional(),
  dueDate: isoDate.optional(),
  requiredAction: z.string().optional(),
  sourceUrl: z.string().url(),
  sources: z.array(z.string()),
  matches: z.array(advisoryTechnologyMatchSchema),
});

export const securitySnapshotSchema = z.object({
  source: z.literal("security-intelligence"),
  collectedAt: isoDate,
  stale: z.boolean(),
  catalogVersion: z.string().optional(),
  feeds: z.array(
    z.object({
      source: z.enum(["cisa-kev", "nvd"]),
      stale: z.boolean().optional(),
      complete: z.boolean().optional(),
      lastSuccessAt: isoDate.optional(),
      windowStart: isoDate.optional(),
      state: z.enum(["healthy", "down"]),
      itemCount: z.number().int().nonnegative(),
      eligibleCount: z.number().int().nonnegative().optional(),
      message: z.string().optional(),
    }),
  ),
  technologies: z.array(trackedTechnologySchema),
  advisories: z.array(securityAdvisorySchema),
  signals: z.array(attentionItemSchema),
});

export const securityResponseSchema = z.object({
  data: z.object({ configured: z.literal(true), health: healthSchema, snapshot: securitySnapshotSchema.nullable() }),
});

export type SecurityResponse = z.infer<typeof securityResponseSchema>;

const careerProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  currentSalary: z.number().int().nonnegative(),
  minimumSalary: z.number().int().nonnegative(),
  preferredSalary: z.number().int().nonnegative(),
  locations: z.array(z.string()),
  allowRemote: z.boolean(),
  targetTitles: z.array(z.string()),
  targetSkills: z.array(z.string()),
  advancementTerms: z.array(z.string()),
  regressionTerms: z.array(z.string()),
});

const careerJobSchema = z.object({
  fitLevel: z.enum(["Strong Fit", "Stretch Fit", "Likely Too Senior"]).optional(),
  cloudTrack: z.enum(["Cloud Security", "Cloud Engineering", "IAM", "DevSecOps", "Detection / SecOps"]).optional(),
  stale: z.boolean().optional(),
  available: z.boolean().optional(),
  availabilityCheckedAt: isoDate.optional(),
  availabilityReason: z.string().optional(),
  id: z.string(),
  externalId: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  arrangement: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  employmentType: z.string().optional(),
  salaryMin: z.number().int().nonnegative().optional(),
  salaryMax: z.number().int().nonnegative().optional(),
  salaryCurrency: z.string().optional(),
  salaryEstimated: z.boolean().optional(),
  salaryEstimateSource: z.string().optional(),
  description: z.string(),
  requiredSkills: z.array(z.string()),
  preferredSkills: z.array(z.string()),
  source: z.string(),
  sourceUrl: z.string().url().optional(),
  postedAt: isoDate.optional(),
  firstSeenAt: isoDate,
  lastSeenAt: isoDate,
  status: z.enum(["new", "saved", "applied", "dismissed"]),
  matchScore: z.number().min(0).max(100),
  careerValueScore: z.number().min(0).max(100),
  reasons: z.array(z.string()),
  gaps: z.array(z.string()),
});

export const careerAvailabilitySchema = z.object({
  checkedAt: isoDate,
  checks: z.array(
    z.object({
      id: z.string(),
      state: z.enum(["available", "removed", "unknown"]),
      reason: z.string(),
    }),
  ),
});

export const careerSnapshotSchema = z.object({
  availabilityCheckedAt: isoDate.optional(),
  source: z.literal("career-radar"),
  collectedAt: isoDate,
  stale: z.boolean(),
  profile: careerProfileSchema,
  providers: z.array(
    z.object({
      source: z.string(),
      state: z.enum(["healthy", "down", "disabled"]),
      itemCount: z.number().int().nonnegative(),
      eligibleCount: z.number().int().nonnegative().optional(),
      message: z.string().optional(),
    }),
  ),
  jobs: z.array(careerJobSchema),
  skillTrends: z.array(
    z.object({
      skill: z.string(),
      currentWeek: z.number().int().nonnegative(),
      previousWeek: z.number().int().nonnegative(),
      delta: z.number().int(),
    }),
  ),
  signals: z.array(attentionItemSchema),
});

export const careerResponseSchema = z.object({
  data: z.object({ configured: z.literal(true), health: healthSchema, snapshot: careerSnapshotSchema.nullable() }),
});

export const jobStatusSchema = z.enum(["new", "saved", "applied", "dismissed"]);
export const jobStatusResponseSchema = z.object({
  data: z.object({ id: z.string(), status: jobStatusSchema }),
});

export type CareerResponse = z.infer<typeof careerResponseSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const careerImportSchema = z.object({
  sourceUrl: z
    .string()
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        (((url.hostname === "www.linkedin.com" || url.hostname === "linkedin.com") &&
          /^\/jobs\/view\/(?:[^/]*-)?[0-9]+\/?$/.test(url.pathname)) ||
          ((url.hostname === "www.indeed.com" || url.hostname === "indeed.com") &&
            ["/viewjob", "/rc/clk"].includes(url.pathname) &&
            /^[a-zA-Z0-9]+$/.test(url.searchParams.get("jk") ?? "")))
      );
    }, "Use a LinkedIn job listing or Indeed viewjob URL."),
  title: z.string().trim().min(3).max(200),
  company: z.string().trim().min(1).max(200),
  location: z.string().trim().min(2).max(300),
  description: z.string().trim().min(80).max(40000),
  arrangement: z.enum(["remote", "hybrid", "onsite", "unknown"]),
});
export const careerImportResponseSchema = z.object({ data: careerJobSchema });
export type CareerImport = z.infer<typeof careerImportSchema>;
