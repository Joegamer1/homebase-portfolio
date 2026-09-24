import { assessNvdVersion } from "./security-versions.js";
import { SecurityFeeds, type FeedStore } from "./security-feeds.js";
import { createHash } from "node:crypto";
import type {
  Collector,
  CollectorHealth,
  RawAttentionSignal,
  SecurityAdvisoryRecord,
  SecurityClassification,
  SecuritySnapshot,
  Severity,
  TrackedTechnology,
} from "@homebase/domain";

export interface SecurityCollectorConfig {
  cisaKevUrl: string;
  nvdCveUrl: string;
  nvdApiKey?: string;
  lookbackDays: number;
  maxAdvisories: number;
  technologies: TrackedTechnology[];
  timeoutMs?: number;
  feedStore?: FeedStore;
  pause?: (ms: number) => Promise<unknown>;
}

type Json = Record<string, unknown>;
type Draft = SecurityAdvisoryRecord & { searchable: string };

const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const stableId = (value: string) => createHash("sha256").update(value).digest("hex");
const iso = (value: unknown): string | undefined => {
  const raw = text(value);
  if (!raw) return undefined;
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};
const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const containsTerm = (haystack: string, term: string) => ` ${haystack} `.includes(` ${term} `);

function scoreSeverity(score?: number, named?: string): Severity {
  const label = (named ?? "").toLowerCase();
  if (label === "critical" || (score ?? 0) >= 9) return "critical";
  if (label === "high" || (score ?? 0) >= 7) return "high";
  if (label === "medium" || (score ?? 0) >= 4) return "medium";
  if (label === "low" || (score ?? 0) > 0) return "low";
  return "info";
}

function nvdMetric(cve: Json) {
  const metrics = object(cve.metrics);
  for (const key of ["cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"]) {
    const first = object(array(metrics[key])[0]);
    const data = object(first.cvssData);
    const score = finite(data.baseScore);
    if (score !== undefined) return { score, severity: text(data.baseSeverity) || text(first.baseSeverity) };
  }
  return {};
}

function cpes(cve: Json): string[] {
  return array(cve.configurations).flatMap((configuration) =>
    array(object(configuration).nodes).flatMap((node) =>
      array(object(node).cpeMatch)
        .map((match) => text(object(match).criteria))
        .filter(Boolean),
    ),
  );
}

function matchesFor(searchable: string, technologies: TrackedTechnology[], configurations?: unknown) {
  const haystack = normalized(searchable);
  return technologies
    .filter((technology) => technology.enabled)
    .flatMap((technology) => {
      const product = normalized(technology.product);
      const terms = [
        ...technology.aliases,
        ...(product.includes(" ") ? [technology.product] : []),
        ...(technology.aliases.length === 0 ? [technology.product] : []),
      ]
        .map(normalized)
        .filter((term) => term.length >= 4);
      const matched = terms.find((term) => containsTerm(haystack, term));
      if (!matched) return [];
      const versionAssessment = assessNvdVersion(technology, configurations);
      return [
        {
          versionAssessment,
          technologyId: technology.id,
          product: technology.product,
          installedVersion: technology.version,
          confidence: technology.confidence,
          explanation:
            versionAssessment === "version-affected"
              ? `Installed version ${technology.version} falls within an NVD vulnerable version range for ${technology.product}. Deployment conditions still require validation.`
              : versionAssessment === "version-not-affected"
                ? `Installed version ${technology.version} is outside every identified NVD vulnerable version range for ${technology.product}.`
                : technology.version
                  ? `Product identity matched “${matched}”; installed version ${technology.version} still requires vendor-range validation.`
                  : `Product identity matched “${matched}”; inventory has no installed version, so exposure requires validation.`,
        },
      ];
    });
}

function retainNvdRow(row: unknown, technologies: TrackedTechnology[], kevIds: Set<string>) {
  const cve = object(object(row).cve);
  const cveId = text(cve.id).toUpperCase();
  const description = text(
    array(cve.descriptions)
      .map(object)
      .find((item) => item.lang === "en")?.value,
  );
  const searchable = [description, ...cpes(cve)].join(" ");
  const metric = nvdMetric(cve);
  const severity = scoreSeverity(metric.score, metric.severity);
  const careerRelevant = careerTerms.some((term) => containsTerm(normalized(searchable), term));
  return (
    kevIds.has(cveId) ||
    matchesFor(searchable, technologies).length > 0 ||
    severity === "critical" ||
    (severity === "high" && careerRelevant)
  );
}

const careerTerms = [
  "linux",
  "container",
  "docker",
  "kubernetes",
  "identity",
  "network",
  "security",
  "cloud",
  "microsoft",
  "cisco",
];

function classification(advisory: Draft): SecurityClassification | undefined {
  if (advisory.matches.some((match) => match.versionAssessment !== "version-not-affected")) return "affects-lab";
  const relevant = careerTerms.some((term) => containsTerm(normalized(advisory.searchable), term));
  if (relevant && (advisory.knownExploited || ["critical", "high"].includes(advisory.severity)))
    return "career-relevant";
  if (advisory.knownExploited || advisory.severity === "critical") return "general-high-signal";
  return undefined;
}

function attention(advisory: SecurityAdvisoryRecord, observedAt: string): RawAttentionSignal | undefined {
  if (advisory.classification !== "affects-lab") return undefined;
  if (!advisory.knownExploited && !["critical", "high"].includes(advisory.severity)) return undefined;
  const relevantMatches = advisory.matches.filter((match) => match.versionAssessment !== "version-not-affected");
  const products = relevantMatches.map((match) => match.product).join(", ");
  return {
    id: `security:${advisory.cveId}`,
    domain: "security",
    title: `${advisory.knownExploited ? "Known exploited" : advisory.severity} advisory matches ${products}`,
    summary: `${advisory.stale ? "Last known advisory (stale): " : ""}${advisory.cveId}: ${relevantMatches[0]?.explanation ?? advisory.summary}`,
    severity: advisory.knownExploited ? "critical" : advisory.severity,
    urgency: advisory.knownExploited ? 98 : 78,
    relevance: 100,
    consequence: advisory.knownExploited ? 92 : 75,
    recency: 95,
    confidence: Math.max(...advisory.matches.map((match) => match.confidence), 70),
    source: advisory.sources.join(" + "),
    sourceUrl: advisory.sourceUrl,
    entity: products,
    observedAt,
    action: { label: "Inspect advisory", href: "/security" },
  };
}

export class SecurityCollector implements Collector<SecuritySnapshot> {
  readonly name = "security-intelligence";

  constructor(
    private readonly config: SecurityCollectorConfig,
    private readonly request = fetch,
  ) {}

  async collect(): Promise<SecuritySnapshot> {
    const collectedAt = new Date().toISOString();
    const feeds = new SecurityFeeds(this.request, this.config.feedStore, this.config.pause);
    const kevResult = await feeds.collect("cisa-kev", {
      url: this.config.cisaKevUrl,
      lookbackDays: this.config.lookbackDays,
      timeoutMs: this.config.timeoutMs,
    });
    const kevIds = new Set(
      array(kevResult.payload.vulnerabilities)
        .map((row) => text(object(row).cveID).toUpperCase())
        .filter(Boolean),
    );
    const nvdResult = await feeds.collect("nvd", {
      url: this.config.nvdCveUrl,
      lookbackDays: this.config.lookbackDays,
      apiKey: this.config.nvdApiKey,
      timeoutMs: this.config.timeoutMs,
      retain: (row) => retainNvdRow(row, this.config.technologies, kevIds),
    });
    if (!kevResult.complete && !nvdResult.complete && !kevResult.lastSuccessAt && !nvdResult.lastSuccessAt)
      throw new Error("Both authoritative security feeds failed");

    const advisories = new Map<string, Draft>();
    const nvdRows = array(nvdResult.payload.vulnerabilities);
    for (const row of nvdRows) {
      const cve = object(object(row).cve);
      const cveId = text(cve.id).toUpperCase();
      if (!/^CVE-\d{4}-\d{4,}$/.test(cveId)) continue;
      const description = text(
        array(cve.descriptions)
          .map(object)
          .find((item) => item.lang === "en")?.value,
      );
      const metric = nvdMetric(cve);
      const searchable = [cveId, description, ...cpes(cve)].join(" ");
      advisories.set(cveId, {
        id: stableId(cveId),
        cveId,
        title: `${cveId} security advisory`,
        summary: description || "No English description was supplied by NVD.",
        severity: scoreSeverity(metric.score, metric.severity),
        cvssScore: metric.score,
        stale: nvdResult.stale,
        knownExploited: false,
        ransomwareUse: "unknown",
        classification: "general-high-signal",
        publishedAt: iso(cve.published),
        updatedAt: iso(cve.lastModified),
        sourceUrl: `https://nvd.nist.gov/vuln/detail/${cveId}`,
        sources: ["NVD"],
        matches: matchesFor(searchable, this.config.technologies, cve.configurations),
        searchable,
      });
    }

    const kev = kevResult.payload;
    const kevRows = array(kev.vulnerabilities);
    for (const value of kevRows) {
      const item = object(value);
      const cveId = text(item.cveID).toUpperCase();
      if (!/^CVE-\d{4}-\d{4,}$/.test(cveId)) continue;
      const searchable = [item.vendorProject, item.product, item.vulnerabilityName, item.shortDescription]
        .map(text)
        .join(" ");
      const prior = advisories.get(cveId);
      advisories.set(cveId, {
        ...(prior ?? {
          id: stableId(cveId),
          cveId,
          publishedAt: undefined,
          updatedAt: undefined,
          cvssScore: undefined,
        }),
        title: text(item.vulnerabilityName) || prior?.title || `${cveId} known exploited vulnerability`,
        summary: text(item.shortDescription) || prior?.summary || "CISA lists this vulnerability as exploited.",
        severity: prior?.severity ?? "info",
        stale: kevResult.stale || Boolean(prior?.stale),
        knownExploited: true,
        ransomwareUse: text(item.knownRansomwareCampaignUse).toLowerCase() === "known" ? "known" : "unknown",
        classification: prior?.classification ?? "general-high-signal",
        dateAddedToKev: iso(item.dateAdded),
        dueDate: iso(item.dueDate),
        requiredAction: text(item.requiredAction) || undefined,
        sourceUrl: `https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext=${encodeURIComponent(cveId)}`,
        sources: prior ? ["CISA KEV", "NVD"] : ["CISA KEV"],
        matches: matchesFor(
          `${text(item.vendorProject)} ${text(item.product)} ${prior?.searchable ?? ""}`,
          this.config.technologies,
        ).map((match) => prior?.matches.find((old) => old.technologyId === match.technologyId) ?? match),
        searchable: `${searchable} ${prior?.searchable ?? ""}`,
      });
    }

    const ranked = [...advisories.values()]
      .map((advisory) => ({ advisory, category: classification(advisory) }))
      .filter((entry): entry is { advisory: Draft; category: SecurityClassification } => Boolean(entry.category))
      .map(({ advisory, category }) => ({ ...advisory, classification: category }))
      .sort(
        (a, b) =>
          Number(b.classification === "affects-lab") - Number(a.classification === "affects-lab") ||
          Number(b.knownExploited) - Number(a.knownExploited) ||
          (b.cvssScore ?? 0) - (a.cvssScore ?? 0) ||
          (b.updatedAt ?? b.dateAddedToKev ?? "").localeCompare(a.updatedAt ?? a.dateAddedToKev ?? ""),
      )
      .slice(0, this.config.maxAdvisories)
      .map(({ searchable, ...advisory }) => {
        void searchable;
        return advisory;
      });
    const signals = ranked.flatMap((advisory) => {
      const value = attention(advisory, collectedAt);
      return value ? [value] : [];
    });
    return {
      source: "security-intelligence",
      collectedAt,
      stale: kevResult.stale || nvdResult.stale,
      catalogVersion: text(kev.catalogVersion) || undefined,
      feeds: [
        {
          source: "cisa-kev",
          state: kevResult.complete ? "healthy" : "down",
          itemCount: kevRows.length,
          stale: kevResult.stale,
          complete: kevResult.complete,
          lastSuccessAt: kevResult.lastSuccessAt,
          message: !kevResult.complete ? "CISA KEV collection failed" : undefined,
        },
        {
          source: "nvd",
          state: nvdResult.complete ? "healthy" : "down",
          itemCount: nvdRows.length,
          stale: nvdResult.stale,
          complete: nvdResult.complete,
          lastSuccessAt: nvdResult.lastSuccessAt,
          windowStart: nvdResult.windowStart,
          message: !nvdResult.complete ? "NVD collection failed" : undefined,
        },
      ],
      technologies: this.config.technologies,
      advisories: ranked,
      signals,
    };
  }

  async testConnection(): Promise<CollectorHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const snapshot = await this.collect();
      const degraded = snapshot.feeds.some((feed) => feed.state === "down");
      return {
        state: degraded ? "degraded" : "healthy",
        checkedAt,
        lastSuccessAt: checkedAt,
        stale: false,
        message: degraded ? "One authoritative feed is unavailable" : "Authoritative security feeds collected",
      };
    } catch {
      return { state: "down", checkedAt, stale: false, message: "Security intelligence collection failed" };
    }
  }
}
