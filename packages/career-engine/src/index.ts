import { createHash } from "node:crypto";
import type { CareerJob, CareerJobDraft, CareerProfile } from "@homebase/domain";

export const defaultCareerProfile: CareerProfile = {
  id: "sample-user",
  name: "Sample cybersecurity profile",
  currentSalary: 60000,
  minimumSalary: 65000,
  preferredSalary: 80000,
  locations: ["Dayton, OH", "Columbus, OH", "Cincinnati, OH"],
  allowRemote: true,
  targetTitles: [
    "security analyst",
    "security engineer",
    "grc analyst",
    "security compliance analyst",
    "soc analyst",
    "cybersecurity analyst",
    "security operations analyst",
    "incident response analyst",
    "detection engineer",
    "cyber risk analyst",
    "it risk analyst",
    "third party risk analyst",
    "vulnerability management analyst",
    "threat intelligence analyst",
    "iam analyst",
    "information security analyst",
    "cloud security analyst",
    "cloud security engineer",
    "security engineer cloud",
    "iam engineer",
    "devsecops engineer",
    "cloud engineer",
    "cloud infrastructure engineer",
    "aws security engineer",
    "azure security engineer",
    "cloud detection engineer",
    "cloud security operations engineer",
    "it auditor",
  ],
  targetSkills: [
    "SIEM",
    "Splunk",
    "Microsoft Sentinel",
    "EDR",
    "CrowdStrike",
    "Incident Response",
    "Detection Engineering",
    "Threat Hunting",
    "Linux",
    "Network Security",
    "AWS",
    "Azure",
    "IAM",
    "Entra ID",
    "Terraform",
    "Docker",
    "CloudTrail",
    "GuardDuty",
    "Vulnerability Management",
    "Security Monitoring",
    "Networking",
    "Git",
    "CI/CD",
    "Python",
  ],
  advancementTerms: [
    "analyst ii",
    "senior analyst",
    "engineer",
    "grc",
    "compliance",
    "risk",
    "detection",
    "incident response",
    "threat hunting",
  ],
  regressionTerms: ["help desk", "desktop support", "service desk", "it support", "tier 1 support"],
};

export const legacyCareerTargetTitles = [
  "soc analyst",
  "security analyst",
  "incident response",
  "detection engineer",
  "security engineer",
];

const skillTerms: Array<[string, RegExp]> = [
  ["SIEM", /\bsiem\b/i],
  ["Splunk", /\bsplunk\b/i],
  ["Microsoft Sentinel", /\b(?:microsoft|azure) sentinel\b/i],
  ["EDR", /\bedr\b/i],
  ["CrowdStrike", /\bcrowdstrike\b/i],
  ["Incident Response", /\bincident response\b/i],
  ["Detection Engineering", /\bdetection(?: engineering| rules?| content)?\b/i],
  ["Threat Hunting", /\bthreat hunt(?:ing)?\b/i],
  ["Vulnerability Management", /\bvulnerability management\b/i],
  ["Network Security", /\bnetwork security\b/i],
  ["Cloud Security", /\bcloud security\b/i],
  ["AWS", /\baws\b|amazon web services/i],
  ["Azure", /\bazure\b/i],
  ["IAM", /\biam\b|identity and access management/i],
  ["Entra ID", /\bentra(?: id)?\b|azure active directory/i],
  ["Terraform", /\bterraform\b/i],
  ["Docker", /\bdocker\b|\bcontainers?\b/i],
  ["CloudTrail", /\bcloudtrail\b/i],
  ["GuardDuty", /\bguardduty\b/i],
  ["Microsoft Defender", /\b(?:microsoft|azure) defender\b/i],
  ["Security Monitoring", /\bsecurity monitoring\b/i],
  ["Networking", /\bnetworking\b|\bvpc\b|\bvnet\b/i],
  ["Git", /\bgit\b/i],
  ["CI/CD", /\bci\s*\/\s*cd\b|continuous integration/i],
  ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["AWS Solutions Architect Associate", /\baws solutions architect(?: associate)?\b|\bsaa-c03\b/i],
  ["AWS Security Specialty", /\baws (?:certified )?security(?: specialty)?\b/i],
  ["AZ-104", /\baz-104\b/i],
  ["AZ-500", /\baz-500\b/i],
  ["Linux", /\blinux\b/i],
  ["Windows", /\bwindows\b/i],
  ["Python", /\bpython\b/i],
  ["PowerShell", /\bpowershell\b/i],
  ["MITRE ATT&CK", /\bmitre(?: att&ck| attack)?\b/i],
  ["NIST", /\bnist\b/i],
  ["Security+", /\bsecurity\+|comptia security/i],
];

const clean = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9+&]+/g, " ")
    .trim();
const contains = (value: string, terms: string[]) => terms.filter((term) => clean(value).includes(clean(term)));
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const unique = (values: string[]) => [...new Set(values)];

export function cloudTrack(title: string): CareerJob["cloudTrack"] {
  if (/\b(?:iam|identity|access management)\b/i.test(title)) return "IAM";
  if (/\bdevsecops\b/i.test(title)) return "DevSecOps";
  if (/\b(?:detection|security operations|secops|soc)\b/i.test(title) && /\bcloud\b/i.test(title))
    return "Detection / SecOps";
  if (/\b(?:cloud|aws|azure)\b/i.test(title) && /\bsecurity\b/i.test(title)) return "Cloud Security";
  if (/\bcloud\b/i.test(title) && /\b(?:engineer|infrastructure)\b/i.test(title)) return "Cloud Engineering";
  return undefined;
}

const seniorSignals = [
  /\b(?:principal|staff|director|head of|chief|manager)\b/i,
  /\b(?:own|lead|define|set)\b[^.]{0,70}\b(?:enterprise(?:-wide)? architecture|organization-wide cloud strategy|cloud strategy)\b/i,
  /\b(?:lead|own|direct)\b[^.]{0,60}\b(?:large|enterprise-wide) cloud migrations?\b/i,
  /\b(?:manage|mentor)\b[^.]{0,45}\b(?:engineering teams?|engineers)\b/i,
];

function relatedTitle(title: string, profile: CareerProfile) {
  const normalized = clean(title);
  return (
    contains(title, profile.targetTitles)[0] ??
    (cloudTrack(title) ? title : undefined) ??
    (/\b(?:security|cyber|soc|incident response|detection|threat)\b/i.test(normalized) ? title : undefined)
  );
}

export function extractSkills(description: string) {
  const preferredBoundary = description.search(/preferred|nice to have|bonus|desired/i);
  const requiredText = preferredBoundary >= 0 ? description.slice(0, preferredBoundary) : description;
  const preferredText = preferredBoundary >= 0 ? description.slice(preferredBoundary) : "";
  const requiredSkills: string[] = [];
  const preferredSkills: string[] = [];
  for (const [skill, pattern] of skillTerms) {
    if (pattern.test(requiredText)) requiredSkills.push(skill);
    else if (pattern.test(preferredText)) preferredSkills.push(skill);
  }
  return { requiredSkills, preferredSkills };
}

function ageDays(value?: string, now = new Date()) {
  if (!value) return 14;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, (now.getTime() - timestamp) / 86_400_000) : 14;
}

export function scoreCareerJob(draft: CareerJobDraft, profile: CareerProfile, now = new Date()) {
  const searchable = `${draft.title} ${draft.description}`;
  const titleMatches = relatedTitle(draft.title, profile) ? [relatedTitle(draft.title, profile)!] : [];
  const regressions = contains(draft.title, profile.regressionTerms);
  const advancement = contains(searchable, profile.advancementTerms);
  const { requiredSkills, preferredSkills } = extractSkills(draft.description);
  const skills = unique([...requiredSkills, ...preferredSkills]);
  const targetSkills = new Set(profile.targetSkills.map(clean));
  const overlappingSkills = skills.filter((skill) => targetSkills.has(clean(skill)));
  const locationMatch = preferredOhioLocation(draft);
  const remoteMatch = profile.allowRemote && draft.arrangement === "remote";
  const salaryMidpoint =
    draft.salaryMin !== undefined || draft.salaryMax !== undefined
      ? ((draft.salaryMin ?? draft.salaryMax ?? 0) + (draft.salaryMax ?? draft.salaryMin ?? 0)) / 2
      : undefined;
  const daysOld = ageDays(draft.postedAt, now);

  const roleScore = titleMatches.length
    ? 34
    : /security|soc|cyber|incident|detection|threat/i.test(draft.title)
      ? 20
      : 0;
  const skillScore = Math.min(26, overlappingSkills.length * 5.2);
  const placeScore = locationMatch ? 16 : remoteMatch ? 10 : 0;
  const recencyScore = daysOld <= 3 ? 14 : daysOld <= 7 ? 11 : daysOld <= 14 ? 7 : 2;
  const salaryScore =
    salaryMidpoint === undefined
      ? 5
      : salaryMidpoint >= profile.preferredSalary
        ? 10
        : salaryMidpoint >= profile.minimumSalary
          ? 7
          : 0;
  const senior = seniorSignals.some((pattern) => pattern.test(`${draft.title}. ${draft.description}`));
  const cloud = cloudTrack(draft.title);
  const cloudSkills = skills.filter((skill) =>
    /AWS|Azure|IAM|Entra|Terraform|Linux|Docker|CloudTrail|GuardDuty|Sentinel|Defender|SIEM|Incident Response|Detection|Vulnerability|Monitoring|Network|Git|CI\/CD/i.test(
      skill,
    ),
  );
  const cloudBonus = cloud ? Math.min(16, cloudSkills.length * 2) : 0;
  const matchScore = clamp(
    roleScore +
      skillScore +
      cloudBonus +
      placeScore +
      recencyScore +
      salaryScore -
      regressions.length * 35 -
      (senior ? 45 : 0),
  );

  const advancementScore = Math.min(35, advancement.length * 12 + (titleMatches.length ? 8 : 0));
  const technicalDepthScore = Math.min(28, skills.length * 4 + overlappingSkills.length * 2);
  const compensationScore =
    salaryMidpoint === undefined
      ? 10
      : salaryMidpoint >= profile.preferredSalary
        ? 25
        : salaryMidpoint >= profile.minimumSalary
          ? 18
          : salaryMidpoint > profile.currentSalary
            ? 10
            : 0;
  const arrangementScore = locationMatch || remoteMatch ? 12 : draft.arrangement === "unknown" ? 6 : 0;
  const careerValueScore = clamp(
    advancementScore +
      technicalDepthScore +
      compensationScore +
      arrangementScore +
      cloudBonus -
      regressions.length * 45 -
      (senior ? 45 : 0),
  );

  const reasons = unique([
    ...(titleMatches.length ? [`Target role: ${titleMatches[0]}`] : []),
    ...(cloudSkills.length >= 2 && cloud ? [`Cloud skill combination: ${cloudSkills.slice(0, 4).join(", ")}`] : []),
    ...(overlappingSkills.length ? [`Skill overlap: ${overlappingSkills.slice(0, 4).join(", ")}`] : []),
    ...(advancement.length ? [`Advancement signal: ${advancement.slice(0, 2).join(", ")}`] : []),
    ...(remoteMatch ? ["Remote work fits profile"] : []),
    ...(locationMatch ? ["Preferred Ohio location: Dayton, Cincinnati, or Columbus"] : []),
    ...(salaryMidpoint !== undefined && salaryMidpoint >= profile.preferredSalary ? ["Meets preferred salary"] : []),
  ]);
  const gaps = unique([
    ...(regressions.length ? [`Likely career regression: ${regressions.join(", ")}`] : []),
    ...(senior ? ["Senior scope: enterprise ownership, migration leadership, or team management"] : []),
    ...(!locationMatch && !remoteMatch && draft.arrangement !== "unknown" ? ["Outside preferred locations"] : []),
    ...(salaryMidpoint !== undefined && salaryMidpoint < profile.minimumSalary ? ["Below minimum salary"] : []),
    ...profile.targetSkills.filter((skill) => !skills.some((found) => clean(found) === clean(skill))).slice(0, 3),
  ]);

  const fitLevel: CareerJob["fitLevel"] = senior
    ? "Likely Too Senior"
    : matchScore >= 75 && careerValueScore >= 70
      ? "Strong Fit"
      : "Stretch Fit";
  return { requiredSkills, preferredSkills, matchScore, careerValueScore, reasons, gaps, fitLevel, cloudTrack: cloud };
}

export function normalizeCareerJob(
  draft: CareerJobDraft,
  profile = defaultCareerProfile,
  seenAt = new Date().toISOString(),
): CareerJob {
  return {
    ...draft,
    id: createHash("sha256").update(`${draft.source}:${draft.externalId}`).digest("hex"),
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    status: "new",
    ...scoreCareerJob(draft, profile, new Date(seenAt)),
  };
}

// Geography is an eligibility gate, independent of keyword/compensation scores.
export function preferredOhioLocation(job: Pick<CareerJobDraft, "location">): boolean {
  return /\b(?:Dayton|Cincinnati|Columbus|Kettering|Beavercreek|Fairborn|Miamisburg|Springboro|Mason|West Chester|Dublin|Hilliard|Westerville|Gahanna)\s*,?\s+(?:OH|Ohio)\b/i.test(
    job.location,
  );
}

export function isEligibleCareerJob(job: CareerJobDraft): boolean {
  if (
    /(?:excluding|except|not available in|cannot (?:hire|employ) in)\b[^.;]{0,100}\b(?:Ohio|OH)\b/i.test(
      job.description,
    )
  )
    return false;
  if (job.arrangement !== "remote") return /\b(?:OH|Ohio)\b/i.test(job.location);
  // Require explicit US evidence in the location, never salary or company boilerplate.
  const usLocation =
    /\b(?:United States(?: of America)?|USA)\b/i.test(job.location) ||
    /\bUS\b|\bU\.S\.(?:A\.)?(?=\W|$)/.test(job.location) ||
    /\bOhio\b/i.test(job.location) ||
    /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/.test(
      job.location,
    );
  if (!usLocation) return false;
  // Reject explicit Ohio exclusions. Other state/residency restrictions still need employer verification.
  return !/\b(?:excluding|except|not available in|cannot (?:hire|employ) in)\b[^.;]{0,100}\b(?:Ohio|OH)\b/i.test(
    job.description,
  );
}

export function compareCareerJobs(a: CareerJob, b: CareerJob): number {
  return (
    Number(preferredOhioLocation(b)) - Number(preferredOhioLocation(a)) ||
    b.matchScore + b.careerValueScore - a.matchScore - a.careerValueScore ||
    a.id.localeCompare(b.id)
  );
}
