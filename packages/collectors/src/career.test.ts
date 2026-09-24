import { describe, expect, it, vi } from "vitest";
import {
  GreenhouseJobProvider,
  inferArrangement,
  isRelevantTitle,
  parseGreenhouseBoards,
  plainText,
} from "./career.js";

it("retains cloud titles and senior postings for scoring", () => {
  expect(isRelevantTitle("Cloud Engineer")).toBe(true);
  expect(isRelevantTitle("DevSecOps Engineer")).toBe(true);
  expect(isRelevantTitle("Principal Cloud Security Engineer")).toBe(true);
  expect(isRelevantTitle("Account Executive")).toBe(false);
});

describe("career providers", () => {
  it("parses configured Greenhouse boards and rejects unsafe tokens", () => {
    expect(parseGreenhouseBoards("gitlab:GitLab, cloudflare:Cloudflare, ../bad:Bad")).toEqual([
      { token: "gitlab", company: "GitLab" },
      { token: "cloudflare", company: "Cloudflare" },
    ]);
  });

  it("normalizes public Greenhouse jobs and filters unrelated titles", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: 42,
              title: "Security Analyst II",
              updated_at: "2026-09-09T12:00:00Z",
              first_published: "2026-09-08T12:00:00Z",
              location: { name: "Remote, US" },
              absolute_url: "https://boards.greenhouse.io/example/jobs/42",
              content: "&lt;p&gt;Investigate Splunk alerts. Salary $90,000 - $110,000.&lt;/p&gt;",
            },
            { id: 43, title: "Account Executive", location: { name: "Remote" }, content: "Security company" },
          ],
        }),
        { status: 200 },
      ),
    );
    const jobs = await new GreenhouseJobProvider({ token: "example", company: "Example" }, request).collect();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      externalId: "42",
      company: "Example",
      arrangement: "remote",
      salaryMin: 90000,
      salaryMax: 110000,
      postedAt: "2026-09-08T12:00:00.000Z",
    });
    expect(request).toHaveBeenCalledWith(
      new URL("https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true"),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("converts descriptions and arrangements deterministically", () => {
    expect(plainText("&amp;lt;p&amp;gt;Hello&amp;nbsp;the owner&amp;lt;/p&amp;gt;")).toBe("Hello the owner");
    expect(inferArrangement("Remote, US", "Hybrid schedule")).toBe("hybrid");
    expect(inferArrangement("London", "We build remote access security software")).toBe("onsite");
    expect(inferArrangement("US", "This is not a remote position")).toBe("hybrid");
    expect(inferArrangement("Cincinnati, OH", "Three days in office, hybrid schedule")).toBe("hybrid");
  });
});

import { AshbyJobProvider, LeverJobProvider, safeJobUrl } from "./career.js";

it("paginates Lever, retains requirements and annual compensation, and supplies direct forms", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(Array.from({ length: 100 }, (_, id) => ({ id: String(id), text: "Account Executive" }))),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: "security-1",
            text: "Detection Engineer",
            categories: { location: "Remote", commitment: "Full-time" },
            country: "US",
            workplaceType: "remote",
            descriptionPlain: "Build detections.",
            lists: [{ text: "Required", content: "<li>Splunk and Python</li>" }],
            salaryRange: { min: 100000, max: 130000, interval: "per-year", currency: "USD" },
          },
        ]),
      ),
    );
  const jobs = await new LeverJobProvider({ token: "example", company: "Example" }, request).collect();
  expect(request).toHaveBeenCalledTimes(2);
  expect(String(request.mock.calls[1][0])).toContain("skip=100");
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    location: "Remote · US",
    arrangement: "remote",
    sourceUrl: "https://jobs.lever.co/example/security-1/apply",
    salaryMin: 100000,
    salaryMax: 130000,
  });
  expect(jobs[0].description).toContain("Required Splunk and Python");
});

it("normalizes Ashby country and compensation and excludes unlisted or unlinked jobs", async () => {
  const job = {
    title: "Security Engineer",
    isRemote: true,
    isListed: true,
    location: "Remote",
    address: { postalAddress: { addressCountry: "USA" } },
    jobUrl: "https://jobs.ashbyhq.com/test/123",
    applyUrl: "https://jobs.ashbyhq.com/test/123/application",
    descriptionPlain: "SIEM and incident response",
    publishedAt: "2026-09-09T00:00:00Z",
    compensation: {
      summaryComponents: [
        { compensationType: "Salary", interval: "1 YEAR", minValue: 95000, maxValue: 125000, currencyCode: "USD" },
      ],
    },
  };
  const request = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        jobs: [job, { ...job, isListed: false }, { ...job, applyUrl: "javascript:alert(1)", jobUrl: undefined }],
      }),
    ),
  );
  const jobs = await new AshbyJobProvider({ token: "test", company: "Test" }, request).collect();
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    location: "Remote · USA",
    arrangement: "remote",
    salaryMin: 95000,
    salaryMax: 125000,
    sourceUrl: job.applyUrl,
  });
});

it("reports malformed and failing feeds instead of treating them as empty successes", async () => {
  for (const Provider of [LeverJobProvider, AshbyJobProvider]) {
    await expect(
      new Provider({ token: "test", company: "Test" }, vi.fn().mockResolvedValue(new Response("{}"))).collect(),
    ).rejects.toThrow("Invalid");
    await expect(
      new Provider(
        { token: "test", company: "Test" },
        vi.fn().mockResolvedValue(new Response("", { status: 429 })),
      ).collect(),
    ).rejects.toThrow("429");
    expect(() => new Provider({ token: "../secret", company: "Test" })).toThrow("Invalid");
  }
  expect(safeJobUrl("javascript:alert(1)")).toBeUndefined();
  expect(safeJobUrl("https://user:password@example.com")).toBeUndefined();
});

it("includes renamed and untitled jobs in full availability inventories before title filtering", async () => {
  const request = vi
    .fn()
    .mockImplementation(
      async () => new Response(JSON.stringify({ jobs: [{ id: 1, title: "Operations Engineer" }, { id: 2 }] })),
    );
  const provider = new GreenhouseJobProvider({ token: "example", company: "Example" }, request);
  expect(await provider.collect()).toEqual([]);
  expect((await provider.collect(true)).map((job) => job.externalId)).toEqual(["1", "2"]);
});
