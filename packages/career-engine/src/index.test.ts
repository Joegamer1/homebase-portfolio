import { describe, expect, it } from "vitest";
import {
  compareCareerJobs,
  defaultCareerProfile,
  extractSkills,
  isEligibleCareerJob,
  normalizeCareerJob,
} from "./index.js";

describe("career engine", () => {
  it("separates required and preferred skills", () => {
    expect(
      extractSkills("Requires Splunk, EDR, Linux, and incident response. Preferred: Python and MITRE ATT&CK."),
    ).toEqual({
      requiredSkills: ["Splunk", "EDR", "Incident Response", "Linux"],
      preferredSkills: ["Python", "MITRE ATT&CK"],
    });
  });

  it("ranks a technical remote detection role as a strong move", () => {
    const job = normalizeCareerJob(
      {
        externalId: "1",
        title: "Detection Engineer",
        company: "Signal Co",
        location: "United States",
        arrangement: "remote",
        salaryMin: 95000,
        salaryMax: 120000,
        description:
          "Build SIEM detections in Splunk and Microsoft Sentinel. Lead threat hunting and incident response with Python.",
        source: "test",
        postedAt: "2026-09-08T12:00:00.000Z",
      },
      defaultCareerProfile,
      "2026-09-09T12:00:00.000Z",
    );
    expect(job.matchScore).toBeGreaterThanOrEqual(80);
    expect(job.careerValueScore).toBeGreaterThanOrEqual(80);
    expect(job.reasons).toContain("Remote work fits profile");
  });

  it("penalizes a keyword-heavy help desk regression", () => {
    const job = normalizeCareerJob({
      externalId: "2",
      title: "Security Help Desk Technician",
      company: "Support Co",
      location: "Dayton, OH",
      arrangement: "onsite",
      salaryMax: 62000,
      description: "Triage SIEM alerts, support EDR tooling, and reset passwords.",
      source: "test",
    });
    expect(job.matchScore).toBeLessThan(50);
    expect(job.careerValueScore).toBeLessThan(40);
    expect(job.gaps[0]).toContain("career regression");
  });

  it.each([
    "GRC Analyst",
    "Security Compliance Analyst II",
    "Cyber Risk Analyst",
    "Third Party Risk Analyst",
    "IAM Analyst",
    "Information Security Analyst",
  ])("recognizes adjacent current-to-next-level role: %s", (title) => {
    const job = normalizeCareerJob({
      externalId: title,
      title,
      company: "Risk Co",
      location: "Remote, US",
      arrangement: "remote",
      salaryMin: 85000,
      description: "Assess controls, document compliance, manage security risk, and support incident response.",
      source: "test",
    });
    expect(job.reasons[0]).toMatch(/Target role/);
    expect(job.matchScore).toBeGreaterThanOrEqual(60);
  });
});

describe("career geography policy", () => {
  const draft = {
    externalId: "remote",
    title: "Security Analyst",
    company: "Test",
    location: "Remote, US",
    arrangement: "remote" as const,
    description: "SIEM incident response",
    source: "test",
  };
  it.each(["Remote, US", "United States", "Dayton, OH", "Cincinnati, Ohio", "Columbus, OH"])(
    "accepts explicit US remote: %s",
    (location) => {
      expect(isEligibleCareerJob({ ...draft, location })).toBe(true);
    },
  );
  it.each(["Remote", "EMEA", "London, UK", "Canada", "North America", "Columbus, Canada"])(
    "excludes ambiguous or foreign remote: %s",
    (location) => {
      expect(isEligibleCareerJob({ ...draft, location })).toBe(false);
    },
  );
  it("includes Ohio hybrid and onsite, while excluding out-of-state onsite and Ohio remote exclusions", () => {
    expect(isEligibleCareerJob({ ...draft, arrangement: "hybrid", location: "Dayton, OH" })).toBe(true);
    expect(isEligibleCareerJob({ ...draft, arrangement: "onsite", location: "Dayton, OH" })).toBe(true);
    expect(isEligibleCareerJob({ ...draft, arrangement: "onsite", location: "Pittsburgh, PA" })).toBe(false);
    expect(isEligibleCareerJob({ ...draft, description: "Remote in the US, excluding Ohio." })).toBe(false);
  });
  it("prioritizes each Ohio city over a higher scoring nationwide job", () => {
    const national = { ...normalizeCareerJob(draft), matchScore: 100, careerValueScore: 100 };
    for (const city of ["Dayton", "Cincinnati", "Columbus"]) {
      const local = normalizeCareerJob({ ...draft, externalId: city, location: `${city}, OH` });
      expect([national, local].sort(compareCareerJobs)[0]).toBe(local);
    }
  });
});

describe("cloud career expansion", () => {
  const base = {
    externalId: "cloud",
    company: "Example",
    location: "Remote, US",
    arrangement: "remote" as const,
    description:
      "Monitor AWS CloudTrail and GuardDuty, manage IAM and Terraform, investigate SIEM alerts on Linux and Docker.",
    source: "test",
  };
  it.each([
    ["Cloud Security Analyst", "Cloud Security"],
    ["Security Engineer, Cloud", "Cloud Security"],
    ["AWS Security Engineer", "Cloud Security"],
    ["Azure Security Engineer", "Cloud Security"],
    ["IAM Engineer", "IAM"],
    ["DevSecOps Engineer", "DevSecOps"],
    ["Cloud Infrastructure Engineer", "Cloud Engineering"],
    ["Cloud Detection Engineer", "Detection / SecOps"],
    ["Cloud Security Operations Engineer", "Detection / SecOps"],
  ])("matches and classifies %s", (title, track) => {
    const job = normalizeCareerJob({ ...base, title });
    expect(job.reasons[0]).toMatch(/Target role/);
    expect(job.cloudTrack).toBe(track);
    expect(job.fitLevel).toBe("Strong Fit");
  });
  it("ranks matching cloud tooling above a thin description and allows three years experience", () => {
    const rich = normalizeCareerJob({
      ...base,
      title: "Cloud Engineer",
      description: `${base.description} 3 years of cloud experience preferred.`,
    });
    const thin = normalizeCareerJob({ ...base, title: "Cloud Engineer", description: "Maintain cloud services." });
    expect(rich.matchScore).toBeGreaterThan(thin.matchScore);
    expect(rich.fitLevel).not.toBe("Likely Too Senior");
  });
  it("demotes enterprise ownership and principal scope", () => {
    const junior = normalizeCareerJob({ ...base, title: "Cloud Security Engineer" });
    const senior = normalizeCareerJob({
      ...base,
      title: "Principal Cloud Security Engineer",
      description: `${base.description} Define organization-wide cloud strategy and manage engineering teams.`,
    });
    expect(senior.fitLevel).toBe("Likely Too Senior");
    expect(senior.matchScore).toBeLessThan(junior.matchScore);
  });
  it("includes Ohio onsite and hybrid jobs and US remote jobs while excluding out-of-state onsite", () => {
    expect(
      isEligibleCareerJob({ ...base, title: "Cloud Engineer", location: "Beavercreek, OH", arrangement: "onsite" }),
    ).toBe(true);
    expect(
      isEligibleCareerJob({ ...base, title: "Cloud Engineer", location: "Cincinnati, Ohio", arrangement: "hybrid" }),
    ).toBe(true);
    expect(
      isEligibleCareerJob({ ...base, title: "Cloud Engineer", location: "Pittsburgh, PA", arrangement: "onsite" }),
    ).toBe(false);
  });
});
