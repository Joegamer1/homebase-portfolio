import { describe, expect, it, vi } from "vitest";
import { SecurityFeeds, type FeedCache, type FeedStore } from "./security-feeds.js";

const url = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const now = new Date("2026-09-10T12:00:00Z");
const row = (id: number, date = "2026-09-09T12:00:00Z") => ({
  cve: {
    id: `CVE-2026-${id}`,
    lastModified: date,
    descriptions: [{ lang: "en", value: "Plex Media Server security issue" }],
  },
});
const page = (rows: unknown[], offset = 0, total = rows.length) =>
  new Response(
    JSON.stringify({
      vulnerabilities: rows,
      startIndex: offset,
      totalResults: total,
      resultsPerPage: rows.length,
    }),
  );
function memory() {
  const values = new Map<string, FeedCache>();
  const store: FeedStore = {
    read: async (key) => values.get(key),
    write: async (key, value) => {
      values.set(key, value);
    },
  };
  return { store, values };
}
const options = { url, lookbackDays: 30, now };

describe("complete feed collection", () => {
  it("reads all pages before saving and paces page requests", async () => {
    const { store, values } = memory();
    const pause = vi.fn().mockResolvedValue(undefined);
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([row(10000)], 0, 2))
      .mockResolvedValueOnce(page([row(10001)], 1, 2));
    const result = await new SecurityFeeds(request, store, pause).collect("nvd", options);
    expect(result.complete).toBe(true);
    expect(result.payload.vulnerabilities).toHaveLength(2);
    expect(new URL(String(request.mock.calls[0][0])).searchParams.get("resultsPerPage")).toBe("1000");
    expect(new URL(String(request.mock.calls[1][0])).searchParams.get("startIndex")).toBe("1");
    expect(pause).toHaveBeenCalledWith(6500);
    expect(values.get("security-feed:nvd")?.collectedAt).toBe(now.toISOString());
  });

  it("keeps the checkpoint and all last-success rows when a later page fails", async () => {
    const { store, values } = memory();
    await new SecurityFeeds(async () => page([row(10000)]), store).collect("nvd", options);
    const before = values.get("security-feed:nvd");
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([row(10001)], 0, 2))
      .mockResolvedValueOnce(new Response("bad", { status: 400 }));
    const result = await new SecurityFeeds(request, store, async () => {}).collect("nvd", {
      ...options,
      now: new Date(now.getTime() + 3600000),
    });
    expect(result).toMatchObject({ complete: false, stale: true, lastSuccessAt: now.toISOString() });
    expect(result.payload.vulnerabilities).toEqual([row(10000)]);
    expect(values.get("security-feed:nvd")).toBe(before);
  });

  it("overlaps and deduplicates page boundaries when NVD's total changes", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([row(10000), row(10001)], 0, 4))
      .mockResolvedValueOnce(page([row(10001), row(10002)], 1, 3));
    const result = await new SecurityFeeds(request, undefined, async () => {}).collect("nvd", options);
    expect(result.complete).toBe(true);
    expect(result.payload.vulnerabilities).toEqual([row(10000), row(10001), row(10002)]);
    expect(new URL(String(request.mock.calls[1][0])).searchParams.get("startIndex")).toBe("1");
  });

  it("filters retained rows without changing pagination offsets", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([row(10000), row(10001)], 0, 3))
      .mockResolvedValueOnce(page([row(10001), row(10002)], 1, 3));
    const result = await new SecurityFeeds(request, undefined, async () => {}).collect("nvd", {
      ...options,
      retain: (value) => (value as ReturnType<typeof row>).cve.id !== "CVE-2026-10001",
    });
    expect(result.complete).toBe(true);
    expect(result.payload.vulnerabilities).toEqual([row(10000), row(10002)]);
    expect(new URL(String(request.mock.calls[1][0])).searchParams.get("startIndex")).toBe("1");
  });

  it("merges incremental updates using an overlap without dropping unchanged CVEs", async () => {
    const { store } = memory();
    await new SecurityFeeds(async () => page([row(10000)]), store).collect("nvd", options);
    const request = vi.fn<typeof fetch>().mockResolvedValue(page([row(10001)]));
    const result = await new SecurityFeeds(request, store).collect("nvd", {
      ...options,
      now: new Date(now.getTime() + 3600000),
    });
    expect(result.payload.vulnerabilities).toHaveLength(2);
    expect(new URL(String(request.mock.calls[0][0])).searchParams.get("lastModStartDate")).toBe(
      "2026-09-10T11:55:00.000Z",
    );
  });

  it.each([
    {},
    { vulnerabilities: [] },
    { vulnerabilities: [row(10000)], startIndex: 1, resultsPerPage: 1, totalResults: 1 },
    { vulnerabilities: [], startIndex: 0, resultsPerPage: 0, totalResults: 2 },
  ])("refuses malformed envelopes or incomplete pages", async (payload) => {
    const result = await new SecurityFeeds(async () => new Response(JSON.stringify(payload))).collect("nvd", options);
    expect(result.complete).toBe(false);
    expect(result.lastSuccessAt).toBeUndefined();
  });

  it("honors Retry-After and never saves a failed attempt", async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("limited", { status: 429, headers: { "Retry-After": "15" } }))
      .mockResolvedValueOnce(page([]));
    expect((await new SecurityFeeds(request, undefined, pause).collect("nvd", options)).complete).toBe(true);
    expect(pause).toHaveBeenCalledWith(15000);
  });

  it("retries transient network failures before accepting a complete response", async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(page([row(10000)]));
    const result = await new SecurityFeeds(request, undefined, pause).collect("nvd", options);
    expect(result.complete).toBe(true);
    expect(result.payload.vulnerabilities).toEqual([row(10000)]);
    expect(pause).toHaveBeenCalledWith(6500);
  });

  it("retains CISA independently when a successful HTTP response has the wrong shape", async () => {
    const { store } = memory();
    const config = { ...options, url: "https://www.cisa.gov/kev.json" };
    const payload = { vulnerabilities: [{ cveID: "CVE-2026-10000" }] };
    await new SecurityFeeds(async () => new Response(JSON.stringify(payload)), store).collect("cisa-kev", config);
    const result = await new SecurityFeeds(async () => new Response("{}"), store).collect("cisa-kev", config);
    expect(result).toMatchObject({ complete: false, stale: true, payload });
  });
});
