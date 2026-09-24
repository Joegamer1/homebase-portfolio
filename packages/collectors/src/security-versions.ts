import type { TrackedTechnology } from "@homebase/domain";

type Json = Record<string, unknown>;
const object = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const key = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export type VersionAssessment = "version-affected" | "version-not-affected" | "unknown";

// Do not guess ordering of vendor suffixes, prereleases, build labels or dates.
export function compareProductVersions(a: string, b: string): number | undefined {
  if (!/^\d+(?:\.\d+)*$/.test(a) || !/^\d+(?:\.\d+)*$/.test(b)) return undefined;
  const left = a.split(".").map(BigInt),
    right = b.split(".").map(BigInt);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] ?? 0n) < (right[i] ?? 0n)) return -1;
    if ((left[i] ?? 0n) > (right[i] ?? 0n)) return 1;
  }
  return 0;
}

function within(version: string, match: Json, cpeVersion: string): boolean | undefined {
  const bounds = [
    ["versionStartIncluding", (c: number) => c >= 0],
    ["versionStartExcluding", (c: number) => c > 0],
    ["versionEndIncluding", (c: number) => c <= 0],
    ["versionEndExcluding", (c: number) => c < 0],
  ] as const;
  const results: boolean[] = [];
  if (cpeVersion !== "*") {
    const comparison = compareProductVersions(version, cpeVersion);
    if (comparison === undefined) return undefined;
    results.push(comparison === 0);
  }
  for (const [name, accepts] of bounds) {
    if (match[name] === undefined) continue;
    if (typeof match[name] !== "string") return undefined;
    const comparison = compareProductVersions(version, match[name]);
    if (comparison === undefined) return undefined;
    results.push(accepts(comparison));
  }
  return results.length ? results.every(Boolean) : undefined;
}

export function assessNvdVersion(technology: TrackedTechnology, configurations: unknown): VersionAssessment {
  if (!technology.version || !technology.vendor) return "unknown";
  const candidates: Array<boolean | undefined> = [];
  const names = [technology.product, ...technology.aliases].map(key);
  const visit = (value: unknown, constrained = false, negated = false) => {
    const node = object(value);
    const negative = negated || node.negate === true;
    const complex = constrained || node.operator === "AND";
    for (const value of array(node.cpeMatch)) {
      const match = object(value);
      if (match.vulnerable !== true || typeof match.criteria !== "string") continue;
      // Escaped fields need a full CPE implementation; keep these unverified.
      const cpe = match.criteria.split(":");
      if (cpe[0] !== "cpe" || cpe[1] !== "2.3" || cpe.length !== 13 || match.criteria.includes("\\")) continue;
      if (key(cpe[3]!) !== key(technology.vendor!) || !names.includes(key(cpe[4]!))) continue;
      const versionMatch = within(technology.version!, match, cpe[5]!);
      // A version outside this range is outside it regardless of environment.
      // Positive matches with platform/update restrictions remain uncertain.
      const restricted = cpe.slice(6).some((field) => field !== "*" && field !== "-");
      candidates.push(
        negative ? undefined : versionMatch === false ? false : complex || restricted ? undefined : versionMatch,
      );
    }
    for (const child of [...array(node.nodes), ...array(node.children)]) visit(child, complex, negative);
  };
  for (const configuration of array(configurations)) visit(configuration);
  if (candidates.some((v) => v === true)) return "version-affected";
  if (candidates.length && candidates.every((v) => v === false)) return "version-not-affected";
  return "unknown";
}
