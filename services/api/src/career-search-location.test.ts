import { expect, it } from "vitest";
import { normalizeCareerJob, isEligibleCareerJob } from "@homebase/career-engine";
import { restoreSearchLocation } from "./career-search-location.js";

const job = normalizeCareerJob({
  externalId: "1",
  source: "jsearch",
  title: "Security Analyst",
  company: "Example",
  location: "Anywhere",
  arrangement: "remote",
  description: "",
});
it("recovers explicit role geography from titles and location statements", () => {
  for (const title of [
    "Security Engineer - Remote US",
    "GRC Analyst Remote (US)",
    "SOC Analyst (Remote – United States)",
    "Cloud Security Engineer- Remote (Anywhere in the U.S.)",
  ])
    expect(isEligibleCareerJob(restoreSearchLocation({ ...job, title }))).toBe(true);
  for (const description of [
    "Location: United States Compensation: $90,000",
    "This is a remote role based in the US.",
    "Location: 100% Remote (U.S.)",
    "US based applicants only",
    "Must be residing in the United States",
    "This Full Remote job, the offer is available from: United States",
  ])
    expect(isEligibleCareerJob(restoreSearchLocation({ ...job, description }))).toBe(true);
});
it("does not turn country boilerplate, unknown locations, or nonremote work into US remote eligibility", () => {
  for (const description of [
    "Must be a U.S. citizen. Authorized to work in the United States.",
    "US salary: $90,000. Benefits in the United States.",
    "Remote position open to candidates residing in Guam or Hawaii. U.S. citizenship is required.",
    "Serving customers in the United States.",
    "Remote role based in the UK.",
  ])
    expect(restoreSearchLocation({ ...job, description }).location).toBe("Anywhere");
  expect(restoreSearchLocation({ ...job, title: "Remote US", arrangement: "hybrid" }).location).toBe("Anywhere");
  expect(restoreSearchLocation({ ...job, title: "Remote US", location: "Canada" }).location).toBe("Canada");
  expect(
    isEligibleCareerJob(restoreSearchLocation({ ...job, title: "Remote US", description: "Not available in Ohio." })),
  ).toBe(false);
});
