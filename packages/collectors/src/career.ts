import type { CareerJobDraft, JobArrangement, JobProvider } from "@homebase/domain";

export interface GreenhouseBoard {
  token: string;
  company: string;
}

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const iso = (value: unknown): string | undefined => {
  const raw = text(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

function decode(value: string) {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };
  let decoded = value;
  for (let pass = 0; pass < 2; pass += 1) {
    decoded = decoded.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => entities[entity] ?? entity);
  }
  return decoded;
}

export function plainText(value: string) {
  return decode(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferArrangement(location: string, description: string): JobArrangement {
  const value = `${location} ${description}`;
  if (
    /\bhybrid\b/i.test(location) ||
    /\bhybrid (?:role|position|work|schedule)\b|\b(?:on[- ]site|in[- ]office) (?:role|position|work|required)|\bnot (?:a )?remote\b/i.test(
      value,
    )
  )
    return "hybrid";
  if (
    /\bremote\b/i.test(location) ||
    /\b(?:fully remote|100% remote|remote (?:role|position|work)|work (?:fully )?remotely)\b/i.test(description)
  )
    return "remote";
  if (location && !/multiple locations|various locations/i.test(location)) return "onsite";
  return "unknown";
}

function salary(description: string) {
  const match = description.match(
    /\$\s?([0-9]{2,3})(?:,([0-9]{3}))?\s*(?:-|–|to)\s*\$?\s?([0-9]{2,3})(?:,([0-9]{3}))?/i,
  );
  if (!match) return {};
  const amount = (whole: string, thousands?: string) =>
    Number(thousands ? `${whole}${thousands}` : whole) * (thousands ? 1 : 1000);
  return { salaryMin: amount(match[1]!, match[2]), salaryMax: amount(match[3]!, match[4]), salaryCurrency: "USD" };
}

export function isRelevantTitle(title: string) {
  if (/\b(?:principal|staff|manager)\b/i.test(title) && !/\b(?:cloud|aws|azure)\b/i.test(title)) return false;
  if (
    /\b(?:account executive|sales|business development|product manager|product grc|security channels|security guard|physical security|loss prevention|intern|director|vice president|chief|head of|subject matter expert|gtm|revenue|software(?: security)? engineer|data engineer|fullstack|full stack|developer)\b/i.test(
      title,
    )
  )
    return false;
  return /\b(?:security|cybersecurity|cyber|soc|incident response|detection|threat|vulnerability|grc|governance(?:,?\s+risk)?|compliance analyst|(?:information|technology|it|third[- ]party|vendor|cyber) risk|information assurance|identity (?:and )?access|iam|it auditor|cloud (?:infrastructure )?engineer|devsecops)\b/i.test(
    title,
  );
}

export class GreenhouseJobProvider implements JobProvider {
  readonly name: string;

  constructor(
    private readonly board: GreenhouseBoard,
    private readonly request = fetch,
    private readonly timeoutMs = 30000,
  ) {
    if (!/^[a-z0-9-]+$/i.test(board.token)) throw new Error("Invalid Greenhouse board token");
    this.name = `greenhouse:${board.token}`;
  }

  async collect(includeAll = false): Promise<CareerJobDraft[]> {
    const url = new URL(`https://boards-api.greenhouse.io/v1/boards/${this.board.token}/jobs`);
    url.searchParams.set("content", "true");
    const response = await this.request(url, { signal: AbortSignal.timeout(this.timeoutMs), redirect: "error" });
    if (!response.ok) throw new Error(`Greenhouse ${this.board.token} returned HTTP ${response.status}`);
    const payload = object(await response.json());
    if (!Array.isArray(payload.jobs)) throw new Error("Invalid Greenhouse job list");
    return array(payload.jobs).flatMap((value) => {
      const row = object(value);
      const title = text(row.title);
      if (!includeAll && (!title || !isRelevantTitle(title))) return [];
      const description = plainText(text(row.content));
      const location = text(object(row.location).name) || "Location not listed";
      const externalId = typeof row.id === "number" || typeof row.id === "string" ? String(row.id) : "";
      if (!externalId) {
        if (includeAll) throw new Error("Posting has no identity");
        return [];
      }
      return [
        {
          externalId,
          title,
          company: this.board.company,
          location,
          arrangement: inferArrangement(location, description),
          employmentType: /\bcontract(?:or)?\b/i.test(description) ? "Contract" : "Full-time",
          description,
          source: this.name,
          sourceUrl:
            safeJobUrl(row.absolute_url) ??
            `https://boards.greenhouse.io/${this.board.token}/jobs/${encodeURIComponent(externalId)}`,
          postedAt: iso(row.first_published),
          ...salary(description),
        } satisfies CareerJobDraft,
      ];
    });
  }
}

export class MockJobProvider implements JobProvider {
  readonly name = "mock-career";

  constructor(private readonly now = () => new Date()) {}

  async collect(): Promise<CareerJobDraft[]> {
    const postedAt = this.now().toISOString();
    return [
      {
        externalId: "detection-engineer-remote",
        title: "Detection Engineer",
        company: "Northstar Security",
        location: "United States",
        arrangement: "remote",
        employmentType: "Full-time",
        salaryMin: 98000,
        salaryMax: 125000,
        salaryCurrency: "USD",
        description:
          "Build SIEM detections in Splunk and Microsoft Sentinel. Investigate EDR alerts, lead threat hunting, and automate incident response with Python. Preferred: MITRE ATT&CK and CrowdStrike.",
        source: this.name,
        sourceUrl: "https://example.com/jobs/detection-engineer",
        postedAt,
      },
      {
        externalId: "security-analyst-ii-columbus",
        title: "Security Analyst II",
        company: "Buckeye Systems",
        location: "Columbus, OH",
        arrangement: "hybrid",
        employmentType: "Full-time",
        salaryMin: 82000,
        salaryMax: 96000,
        salaryCurrency: "USD",
        description:
          "Investigate SIEM and EDR alerts, coordinate incident response, and improve threat hunting playbooks. Preferred: Splunk, Linux, and PowerShell.",
        source: this.name,
        sourceUrl: "https://example.com/jobs/security-analyst-ii",
        postedAt,
      },
      {
        externalId: "security-help-desk-dayton",
        title: "Security Help Desk Technician",
        company: "Miami Valley Support",
        location: "Dayton, OH",
        arrangement: "onsite",
        employmentType: "Full-time",
        salaryMin: 54000,
        salaryMax: 62000,
        salaryCurrency: "USD",
        description: "Reset passwords, route SIEM alerts, and provide tier 1 desktop support.",
        source: this.name,
        sourceUrl: "https://example.com/jobs/security-help-desk",
        postedAt,
      },
    ];
  }
}

export function parseGreenhouseBoards(value: string): GreenhouseBoard[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [token, ...company] = entry.split(":");
      if (!token || !company.length || !/^[a-z0-9-]+$/i.test(token)) return [];
      return [{ token, company: company.join(":").trim() || token }];
    });
}

/** Only navigable public HTTPS URLs may leave the collector boundary. */
export function safeJobUrl(value: unknown): string | undefined {
  try {
    const url = new URL(text(value));
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function annualSalary(value: unknown, interval: string, currency: string) {
  const row = object(value);
  if (!/^(year|yearly|annual|per-year|1 YEAR)$/i.test(interval)) return {};
  const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);
  return {
    salaryMin: amount(row.min ?? row.minValue),
    salaryMax: amount(row.max ?? row.maxValue),
    salaryCurrency: currency || undefined,
  };
}

export class LeverJobProvider implements JobProvider {
  readonly name: string;
  constructor(
    private readonly board: GreenhouseBoard,
    private readonly request = fetch,
    private readonly timeoutMs = 30000,
  ) {
    if (!/^[a-z0-9-]+$/i.test(board.token)) throw new Error("Invalid Lever board token");
    this.name = `lever:${board.token}`;
  }
  async collect(includeAll = false): Promise<CareerJobDraft[]> {
    const jobs: CareerJobDraft[] = [];
    const signal = AbortSignal.timeout(this.timeoutMs);
    for (let skip = 0; skip < 10000; skip += 100) {
      const response = await this.request(
        new URL(`https://api.lever.co/v0/postings/${this.board.token}?mode=json&limit=100&skip=${skip}`),
        { signal, redirect: "error" },
      );
      if (!response.ok) throw new Error(`Lever ${this.board.token} returned HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error("Invalid Lever job list");
      for (const value of payload) {
        const row = object(value);
        const title = text(row.text);
        const externalId = text(row.id);
        if (includeAll && !externalId) throw new Error("Posting has no identity");
        if (!externalId || (!includeAll && (!title || !isRelevantTitle(title)))) continue;
        const categories = object(row.categories);
        const description = plainText(
          [
            text(row.descriptionPlain) || text(row.description),
            ...array(row.lists).map((item) => `${text(object(item).text)} ${text(object(item).content)}`),
            text(row.additionalPlain) || text(row.additional),
          ].join(" "),
        );
        const location = [
          ...new Set([
            text(categories.location),
            ...array(categories.allLocations).map(text),
            text(row.country).toUpperCase(),
          ]),
        ]
          .filter(Boolean)
          .join(" · ");
        const range = object(row.salaryRange);
        jobs.push({
          externalId,
          title,
          company: this.board.company,
          location,
          arrangement:
            row.workplaceType === "hybrid"
              ? "hybrid"
              : row.workplaceType === "on-site"
                ? "onsite"
                : inferArrangement(`${row.workplaceType === "remote" ? "Remote · " : ""}${location}`, description),
          description,
          employmentType: text(categories.commitment) || undefined,
          source: this.name,
          sourceUrl:
            safeJobUrl(row.applyUrl) ??
            safeJobUrl(row.hostedUrl) ??
            `https://jobs.lever.co/${this.board.token}/${encodeURIComponent(externalId)}/apply`,
          ...annualSalary(range, text(range.interval), text(range.currency)),
        });
      }
      if (payload.length < 100) return jobs;
    }
    throw new Error("Lever pagination exceeded collection limit");
  }
}

export class AshbyJobProvider implements JobProvider {
  readonly name: string;
  constructor(
    private readonly board: GreenhouseBoard,
    private readonly request = fetch,
    private readonly timeoutMs = 30000,
  ) {
    if (!/^[a-z0-9-]+$/i.test(board.token)) throw new Error("Invalid Ashby board token");
    this.name = `ashby:${board.token}`;
  }
  async collect(includeAll = false): Promise<CareerJobDraft[]> {
    const response = await this.request(
      new URL(`https://api.ashbyhq.com/posting-api/job-board/${this.board.token}?includeCompensation=true`),
      { signal: AbortSignal.timeout(this.timeoutMs), redirect: "error" },
    );
    if (!response.ok) throw new Error(`Ashby ${this.board.token} returned HTTP ${response.status}`);
    const payload = object(await response.json());
    if (!Array.isArray(payload.jobs)) throw new Error("Invalid Ashby job list");
    return payload.jobs.flatMap((value) => {
      const row = object(value);
      const title = text(row.title);
      const sourceUrl = safeJobUrl(row.applyUrl) ?? safeJobUrl(row.jobUrl);
      if (row.isListed === false) return [];
      if (includeAll && !sourceUrl && !text(row.id)) throw new Error("Posting has no identity URL");
      if (!includeAll && (!title || !isRelevantTitle(title) || !sourceUrl)) return [];
      const externalId =
        text(row.id) || new URL(safeJobUrl(row.jobUrl) ?? sourceUrl!).pathname.replace(/\/apply\/?$/, "");
      const address = object(object(row.address).postalAddress);
      const location = [
        text(row.location),
        text(address.addressCountry),
        ...array(row.secondaryLocations).flatMap((item) => [
          text(object(item).location),
          text(object(object(item).address).addressCountry),
        ]),
      ]
        .filter(Boolean)
        .join(" · ");
      const description = plainText(text(row.descriptionPlain) || text(row.descriptionHtml));
      const compensation =
        array(object(row.compensation).summaryComponents)
          .map(object)
          .find((item) => item.compensationType === "Salary" && item.interval === "1 YEAR") ?? {};
      return [
        {
          externalId,
          title,
          company: this.board.company,
          location,
          description,
          arrangement:
            row.workplaceType === "Hybrid"
              ? "hybrid"
              : row.workplaceType === "OnSite"
                ? "onsite"
                : inferArrangement(
                    `${row.isRemote === true || row.workplaceType === "Remote" ? "Remote · " : ""}${location}`,
                    description,
                  ),
          employmentType: text(row.employmentType) || undefined,
          source: this.name,
          sourceUrl,
          postedAt: iso(row.publishedAt),
          ...annualSalary(compensation, text(compensation.interval), text(compensation.currencyCode)),
        } satisfies CareerJobDraft,
      ];
    });
  }
}

/** One result page costs one credit. Never paginate or fetch details implicitly. */
export class JSearchJobProvider implements JobProvider {
  readonly name = "jsearch";
  constructor(
    private readonly apiKey: string,
    private readonly query: string,
    private readonly request = fetch,
  ) {}

  async collect(): Promise<CareerJobDraft[]> {
    const url = new URL("https://api.openwebninja.com/jsearch/search-v2");
    url.search = new URLSearchParams({
      query: `"${this.query.replace(/"/g, "").trim()}" in United States`,
      country: "us",
      language: "en",
      work_from_home: "true",
      date_posted: "month",
      num_pages: "1",
    }).toString();
    const response = await this.request(url, {
      headers: { "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`JSearch returned HTTP ${response.status}`);
    const payload = object(await response.json());
    const data = object(payload.data);
    if (payload.status !== "OK" || !Array.isArray(data.jobs)) throw new Error("Invalid JSearch response");
    return data.jobs.flatMap((value) => {
      const row = object(value);
      const title = text(row.job_title);
      const options = array(row.apply_options).map(object);
      const sourceUrl =
        options
          .filter((option) => option.is_direct === true)
          .map((option) => safeJobUrl(option.apply_link))
          .find(Boolean) ??
        safeJobUrl(row.job_apply_link) ??
        options.map((option) => safeJobUrl(option.apply_link)).find(Boolean);
      if (!text(row.job_id) || !text(row.employer_name) || !isRelevantTitle(title) || !sourceUrl) return [];
      const description = plainText(text(row.job_description));
      const location = [
        text(row.job_location) || [text(row.job_city), text(row.job_state)].filter(Boolean).join(", "),
        text(row.job_country),
      ]
        .filter(Boolean)
        .join(", ");
      const inferred = inferArrangement(location, description);
      const arrangement =
        inferred === "hybrid"
          ? "hybrid"
          : row.job_is_remote === true
            ? "remote"
            : row.job_is_remote === false
              ? "onsite"
              : inferred;
      const annual = /^(year|yearly|annual)$/i.test(text(row.job_salary_period));
      const amount = (value: unknown) =>
        annual && typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
      return [
        {
          externalId: text(row.job_id),
          title,
          company: text(row.employer_name),
          description,
          location,
          arrangement,
          source: this.name,
          sourceUrl,
          employmentType: text(row.job_employment_type) || undefined,
          postedAt: iso(row.job_posted_at_datetime_utc),
          salaryMin: amount(row.job_min_salary),
          salaryMax: amount(row.job_max_salary),
          salaryCurrency: text(row.job_salary_currency) || undefined,
        } satisfies CareerJobDraft,
      ];
    });
  }
}
