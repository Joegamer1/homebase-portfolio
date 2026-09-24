import { describe, expect, it } from "vitest";
import type { TrackedTechnology } from "@homebase/domain";
import { SecurityCollector } from "./security.js";

const technologies: TrackedTechnology[] = [
  {
    id: "plex",
    product: "Plex Media Server",
    vendor: "Plex",
    version: "1.2.3",
    source: "manual",
    confidence: 95,
    enabled: true,
    aliases: ["plex"],
  },
  {
    id: "disabled",
    product: "Example Product",
    source: "manual",
    confidence: 100,
    enabled: false,
    aliases: [],
  },
];

const kev = {
  catalogVersion: "2026.09.09",
  vulnerabilities: [
    {
      cveID: "CVE-2026-12345",
      vendorProject: "Plex",
      product: "Plex Media Server",
      vulnerabilityName: "Plex Media Server Remote Code Execution Vulnerability",
      dateAdded: "2026-09-08",
      shortDescription: "Plex Media Server contains a remote code execution vulnerability.",
      requiredAction: "Apply mitigations per vendor instructions.",
      dueDate: "2026-09-29",
      knownRansomwareCampaignUse: "Known",
    },
  ],
};

const nvd = {
  vulnerabilities: [
    {
      cve: {
        id: "CVE-2026-12345",
        published: "2026-09-07T12:00:00.000Z",
        lastModified: "2026-09-08T12:00:00.000Z",
        descriptions: [{ lang: "en", value: "A flaw in Plex Media Server allows code execution." }],
        metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.8, baseSeverity: "CRITICAL" } }] },
        configurations: [],
      },
    },
    {
      cve: {
        id: "CVE-2026-23456",
        published: "2026-09-08T12:00:00.000Z",
        lastModified: "2026-09-08T12:00:00.000Z",
        descriptions: [{ lang: "en", value: "A critical Kubernetes security vulnerability." }],
        metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.1, baseSeverity: "CRITICAL" } }] },
        configurations: [],
      },
    },
    {
      cve: {
        id: "CVE-2026-34567",
        descriptions: [{ lang: "en", value: "An unrelated low impact issue." }],
        metrics: { cvssMetricV31: [{ cvssData: { baseScore: 2.1, baseSeverity: "LOW" } }] },
        configurations: [],
      },
    },
  ],
};

const fixture =
  (handler: typeof fetch): typeof fetch =>
  async (input, init) => {
    const response = await handler(input, init);
    if (!response.ok || String(input).includes("cisa.gov")) return response;
    const data = (await response.json()) as { vulnerabilities: Array<{ cve: Record<string, unknown> }> };
    data.vulnerabilities = data.vulnerabilities.map((row) => ({
      cve: { lastModified: "2026-09-09T12:00:00Z", ...row.cve },
    }));
    return new Response(
      JSON.stringify({
        ...data,
        totalResults: data.vulnerabilities.length,
        resultsPerPage: data.vulnerabilities.length,
        startIndex: 0,
      }),
    );
  };
const request = async (input: string | URL | Request) => {
  const url = String(input);
  return new Response(JSON.stringify(url.includes("cisa.gov") ? kev : nvd), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

describe("SecurityCollector", () => {
  it("deduplicates KEV and NVD, explains lab matches, and filters raw volume", async () => {
    const snapshot = await new SecurityCollector(
      {
        cisaKevUrl: "https://www.cisa.gov/kev.json",
        nvdCveUrl: "https://services.nvd.nist.gov/rest/json/cves/2.0",
        lookbackDays: 30,
        maxAdvisories: 100,
        technologies,
        pause: async () => {},
      },
      fixture(request),
    ).collect();

    expect(snapshot.advisories).toHaveLength(2);
    expect(snapshot.advisories[0]).toMatchObject({
      cveId: "CVE-2026-12345",
      knownExploited: true,
      ransomwareUse: "known",
      classification: "affects-lab",
      sources: ["CISA KEV", "NVD"],
    });
    expect(snapshot.advisories[0]?.matches[0]?.explanation).toContain("installed version 1.2.3");
    expect(snapshot.advisories[1]?.classification).toBe("career-relevant");
    expect(snapshot.signals).toHaveLength(1);
    expect(snapshot.signals[0]).toMatchObject({ domain: "security", severity: "critical" });
  });

  it("returns a partial snapshot when one authoritative feed is down", async () => {
    const partialRequest = async (input: string | URL | Request) => {
      if (String(input).includes("cisa.gov")) return new Response("unavailable", { status: 503 });
      return new Response(JSON.stringify(nvd), { status: 200 });
    };
    const snapshot = await new SecurityCollector(
      {
        cisaKevUrl: "https://www.cisa.gov/kev.json",
        nvdCveUrl: "https://services.nvd.nist.gov/rest/json/cves/2.0",
        lookbackDays: 30,
        maxAdvisories: 100,
        technologies,
        pause: async () => {},
      },
      fixture(partialRequest),
    ).collect();
    expect(snapshot.feeds).toContainEqual(
      expect.objectContaining({
        source: "cisa-kev",
        state: "down",
        itemCount: 0,
        message: "CISA KEV collection failed",
      }),
    );
    expect(snapshot.advisories.length).toBeGreaterThan(0);
  });

  it("does not match product aliases inside unrelated words", async () => {
    const partialRequest = async (input: string | URL | Request) => {
      if (String(input).includes("cisa.gov")) return new Response(JSON.stringify({ vulnerabilities: [] }));
      return new Response(
        JSON.stringify({
          vulnerabilities: [
            {
              cve: {
                id: "CVE-2026-45678",
                descriptions: [{ lang: "en", value: "A complex parser has a critical flaw." }],
                metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.2, baseSeverity: "CRITICAL" } }] },
                configurations: [],
              },
            },
          ],
        }),
      );
    };
    const snapshot = await new SecurityCollector(
      {
        cisaKevUrl: "https://www.cisa.gov/kev.json",
        nvdCveUrl: "https://services.nvd.nist.gov/rest/json/cves/2.0",
        lookbackDays: 30,
        maxAdvisories: 100,
        technologies,
        pause: async () => {},
      },
      fixture(partialRequest),
    ).collect();

    expect(snapshot.advisories[0]?.matches).toEqual([]);
    expect(snapshot.advisories[0]?.classification).toBe("general-high-signal");
  });

  it("uses specific aliases instead of a generic one-word product name", async () => {
    const debian: TrackedTechnology = {
      id: "debian",
      product: "Debian",
      vendor: "Debian",
      source: "manual",
      confidence: 80,
      enabled: true,
      aliases: ["debian operating system", "debian linux kernel"],
    };
    const specificRequest = async (input: string | URL | Request) =>
      new Response(
        JSON.stringify(
          String(input).includes("cisa.gov")
            ? { vulnerabilities: [] }
            : {
                vulnerabilities: [
                  {
                    cve: {
                      id: "CVE-2026-56789",
                      descriptions: [{ lang: "en", value: "A Debian-packaged Redis component issue." }],
                      metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.2, baseSeverity: "CRITICAL" } }] },
                      configurations: [],
                    },
                  },
                ],
              },
        ),
      );
    const snapshot = await new SecurityCollector(
      {
        cisaKevUrl: "https://www.cisa.gov/kev.json",
        nvdCveUrl: "https://services.nvd.nist.gov/rest/json/cves/2.0",
        lookbackDays: 30,
        maxAdvisories: 100,
        technologies: [debian],
        pause: async () => {},
      },
      fixture(specificRequest),
    ).collect();

    expect(snapshot.advisories[0]?.matches).toEqual([]);
  });
});

it("preserves NVD version exclusions when merging an exploited CISA advisory", async () => {
  const versioned = structuredClone(nvd);
  versioned.vulnerabilities[0]!.cve.configurations = [
    {
      nodes: [
        {
          operator: "OR",
          cpeMatch: [
            {
              vulnerable: true,
              criteria: "cpe:2.3:a:plex:plex_media_server:*:*:*:*:*:*:*:*",
              versionEndExcluding: "1.2.3",
            },
          ],
        },
      ],
    },
  ] as never;
  const snapshot = await new SecurityCollector(
    {
      cisaKevUrl: "https://www.cisa.gov/feed",
      nvdCveUrl: "https://nvd.example/api",
      lookbackDays: 30,
      maxAdvisories: 100,
      technologies,
    },
    fixture(async (url) => new Response(JSON.stringify(String(url).includes("cisa.gov") ? kev : versioned))),
  ).collect();
  const advisory = snapshot.advisories.find((item) => item.cveId === "CVE-2026-12345");
  expect(advisory?.knownExploited).toBe(true);
  expect(advisory?.matches[0]?.versionAssessment).toBe("version-not-affected");
  expect(advisory?.classification).not.toBe("affects-lab");
  expect(snapshot.signals.some((signal) => signal.id.includes("CVE-2026-12345"))).toBe(false);
});
