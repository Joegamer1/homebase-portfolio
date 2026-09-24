import type { CareerJob } from "@homebase/domain";

// Search-v2 often supplies "Anywhere" even when the posting names its hiring
// country. Only explicit role-location evidence can repair that missing metadata;
// a US search parameter, citizenship requirement, or benefits text cannot.
export function restoreSearchLocation(job: CareerJob): CareerJob {
  if (job.arrangement !== "remote" || !/^(?:anywhere|remote)?$/i.test(job.location.trim())) return job;
  const country = String.raw`(?:United States(?: of America)?|USA|US\b|U\.S\.(?:A\.)?)`;
  const titleLocation = new RegExp(String.raw`\bremote\s*[-–,:(]*\s*(?:anywhere in the\s+)?${country}`, "i");
  const descriptionLocation = new RegExp(
    String.raw`\blocation\s*:\s*(?:100%\s*)?(?:remote\s*[-–,(]*\s*)?${country}|\bremote (?:role|position|job) (?:based in|in) the ${country}|\b${country}\s+based applicants only|\bresiding in the ${country}|\b(?:open to candidates in|offer is available from:)\s*(?:eligible locations in the Continental\s+)?${country}|\b100% Remote\s*[-–(]*\s*${country}\s+Only`,
    "i",
  );
  if (!titleLocation.test(job.title) && !descriptionLocation.test(job.description)) return job;
  return { ...job, location: "Remote, United States" };
}
