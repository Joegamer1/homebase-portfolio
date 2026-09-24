import { setTimeout as delay } from "node:timers/promises";

export type FeedJson = Record<string, unknown>;
export interface FeedStore {
  read(key: string): Promise<unknown>;
  write(key: string, value: FeedCache): Promise<void>;
}
export interface FeedCache {
  version: 1;
  url: string;
  collectedAt: string;
  windowStart?: string;
  payload: FeedJson;
}
export interface FeedResult {
  payload: FeedJson;
  stale: boolean;
  complete: boolean;
  lastSuccessAt?: string;
  windowStart?: string;
}
const obj = (value: unknown): FeedJson => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid feed object");
  return value as FeedJson;
};
const count = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid pagination count");
  return value;
};
export function validateFeed(payload: unknown, source: "nvd" | "cisa-kev"): FeedJson {
  const data = obj(payload);
  if (!Array.isArray(data.vulnerabilities)) throw new Error("Missing vulnerabilities list");
  for (const row of data.vulnerabilities) {
    const id = source === "nvd" ? obj(obj(row).cve).id : obj(row).cveID;
    if (source === "nvd") {
      const modified = obj(obj(row).cve).lastModified;
      if (typeof modified !== "string" || !Number.isFinite(Date.parse(modified)))
        throw new Error("Missing NVD modification timestamp");
    }
    if (typeof id !== "string" || !/^CVE-\d{4}-\d{4,}$/.test(id)) throw new Error("Invalid CVE identity");
  }
  return data;
}

export class SecurityFeeds {
  constructor(
    private readonly request: typeof fetch,
    private readonly store?: FeedStore,
    private readonly pause: (ms: number) => Promise<unknown> = delay,
  ) {}

  private async json(url: URL, apiKey?: string, timeoutMs = 120000): Promise<FeedJson> {
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Security feed URL must use HTTPS");
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.request(url, {
          headers: apiKey ? { apiKey } : {},
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        });
      } catch (error) {
        if (attempt >= 2) throw error;
        await this.pause(6500 * (attempt + 1));
        continue;
      }
      if (response.ok) return obj(await response.json());
      if (attempt >= 2 || ![429, 502, 503, 504].includes(response.status))
        throw new Error(`Feed HTTP ${response.status}`);
      const retry = response.headers.get("retry-after");
      const retryMs = retry === null ? 0 : /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      // Longer server cooldowns are retried on the next scheduled run, never early.
      if (retryMs > 60000) throw new Error("Feed rate limited until a later run");
      await response.body?.cancel();
      await this.pause(Math.max(6500 * (attempt + 1), Number.isFinite(retryMs) ? retryMs : 0));
    }
  }

  async collect(
    source: "nvd" | "cisa-kev",
    options: {
      url: string;
      lookbackDays: number;
      apiKey?: string;
      timeoutMs?: number;
      now?: Date;
      retain?: (row: unknown) => boolean;
    },
  ): Promise<FeedResult> {
    const key = `security-feed:${source}`;
    const now = options.now ?? new Date();
    const through = now.toISOString();
    let previous: FeedCache | undefined;
    const stored = await this.store?.read(key);
    try {
      const value = obj(stored);
      if (
        value.version === 1 &&
        value.url === options.url &&
        typeof value.collectedAt === "string" &&
        Number.isFinite(Date.parse(value.collectedAt)) &&
        Date.parse(value.collectedAt) <= now.getTime()
      ) {
        previous = {
          version: 1,
          url: options.url,
          collectedAt: value.collectedAt,
          windowStart: typeof value.windowStart === "string" ? value.windowStart : undefined,
          payload: validateFeed(value.payload, source),
        };
      }
    } catch {
      /* An invalid cache cannot establish completeness. */
    }
    try {
      const floor = now.getTime() - options.lookbackDays * 86400000;
      // A five-minute overlap covers boundary timestamps. A widened window requires a full refresh.
      const incremental =
        source === "nvd" &&
        previous?.windowStart &&
        Date.parse(previous.windowStart) <= floor &&
        Date.parse(previous.collectedAt) >= floor;
      const start = incremental ? Math.max(floor, Date.parse(previous!.collectedAt) - 300000) : floor;
      let payload: FeedJson;
      if (source === "cisa-kev") {
        payload = validateFeed(await this.json(new URL(options.url), undefined, options.timeoutMs), source);
      } else {
        const rows: unknown[] = [];
        let startIndex = 0;
        for (let page = 0; ; page += 1) {
          if (page >= 200) throw new Error("NVD page budget exceeded; window remains incomplete");
          if (page > 0) await this.pause(6500);
          const url = new URL(options.url);
          url.searchParams.set("lastModStartDate", new Date(start).toISOString());
          url.searchParams.set("lastModEndDate", through);
          // NVD's maximum page can exceed 20 MB and stall during initial synchronization.
          // Half-sized pages trade a few paced requests for predictable transfer and parsing.
          url.searchParams.set("resultsPerPage", "1000");
          url.searchParams.set("startIndex", String(startIndex));
          const data = validateFeed(await this.json(url, options.apiKey, options.timeoutMs), source);
          const total = count(data.totalResults);
          const offset = count(data.startIndex);
          const pageSize = count(data.resultsPerPage);
          const batch = data.vulnerabilities as unknown[];
          if (offset !== startIndex || pageSize !== batch.length || (batch.length === 0 && offset < total)) {
            throw new Error("NVD pagination is inconsistent; refusing incomplete window");
          }
          const pageIds = new Set<string>();
          for (const row of batch) {
            const id = String(obj(obj(row).cve).id);
            if (pageIds.has(id)) throw new Error("Duplicate CVE within NVD page");
            pageIds.add(id);
          }
          rows.push(...(options.retain ? batch.filter(options.retain) : batch));
          const endIndex = offset + batch.length;
          if (endIndex >= total) break;
          // NVD's total can change while a fixed window is read. Refetch a small
          // boundary overlap so removals cannot make the next page skip a CVE.
          startIndex = endIndex - Math.min(10, Math.max(0, batch.length - 1));
        }
        const merged = new Map<string, unknown>();
        if (incremental) {
          for (const row of previous!.payload.vulnerabilities as unknown[]) {
            const cve = obj(obj(row).cve);
            if (typeof cve.lastModified === "string" && Date.parse(cve.lastModified) >= floor)
              merged.set(String(cve.id), row);
          }
        }
        for (const row of rows) {
          const id = String(obj(obj(row).cve).id);
          merged.set(id, row);
        }
        payload = { vulnerabilities: [...merged.values()] };
      }
      const cache: FeedCache = {
        version: 1,
        url: options.url,
        collectedAt: through,
        windowStart: new Date(floor).toISOString(),
        payload,
      };
      await this.store?.write(key, cache);
      return { payload, stale: false, complete: true, lastSuccessAt: through, windowStart: cache.windowStart };
    } catch {
      return {
        payload: previous?.payload ?? { vulnerabilities: [] },
        stale: Boolean(previous),
        complete: false,
        lastSuccessAt: previous?.collectedAt,
        windowStart: previous?.windowStart,
      };
    }
  }
}
