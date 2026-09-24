import { expect, it } from "vitest";
import { assessNvdVersion, compareProductVersions } from "./security-versions.js";
const technology = {
  id: "plex",
  product: "Plex Media Server",
  vendor: "Plex",
  version: "1.20.3",
  aliases: ["plex"],
  enabled: true,
  source: "manual",
  confidence: 90,
};
const match = {
  vulnerable: true,
  criteria: "cpe:2.3:a:plex:plex_media_server:*:*:*:*:*:*:*:*",
  versionStartIncluding: "1.0",
  versionEndExcluding: "1.20.4",
};
const config = (m: unknown) => [{ nodes: [{ operator: "OR", cpeMatch: [m] }] }];
it("uses numeric version ordering and inclusive/exclusive range boundaries", () => {
  expect(compareProductVersions("1.10", "1.9")).toBe(1);
  expect(compareProductVersions("1.0", "1.0.0")).toBe(0);
  expect(compareProductVersions("1.0-ubuntu1", "1.0")).toBeUndefined();
  expect(assessNvdVersion(technology, config(match))).toBe("version-affected");
  expect(assessNvdVersion({ ...technology, version: "1.20.4" }, config(match))).toBe("version-not-affected");
  expect(assessNvdVersion({ ...technology, version: "1.0" }, config(match))).toBe("version-affected");
});
it("does not claim exposure without identity, versions, or simple applicability evidence", () => {
  expect(assessNvdVersion({ ...technology, vendor: "Other" }, config(match))).toBe("unknown");
  expect(assessNvdVersion({ ...technology, version: undefined }, config(match))).toBe("unknown");
  expect(assessNvdVersion({ ...technology, version: "1.20.3-beta" }, config(match))).toBe("unknown");
  expect(assessNvdVersion(technology, [{ operator: "AND", nodes: [{ cpeMatch: [match] }] }])).toBe("unknown");
  expect(assessNvdVersion(technology, config({ ...match, vulnerable: false }))).toBe("unknown");
  expect(
    assessNvdVersion(
      technology,
      config({ ...match, versionEndExcluding: undefined, versionStartIncluding: undefined }),
    ),
  ).toBe("unknown");
});
it("keeps uncertain or overlapping alternatives instead of ruling out exposure", () => {
  const patched = { ...match, versionEndExcluding: "1.10" };
  expect(assessNvdVersion(technology, [{ nodes: [{ cpeMatch: [patched, match] }] }])).toBe("version-affected");
  expect(
    assessNvdVersion(technology, [
      { nodes: [{ cpeMatch: [patched, { ...match, versionEndExcluding: "2.0-vendor" }] }] },
    ]),
  ).toBe("unknown");
});

it("never interprets a negated configuration as a safe version range", () => {
  expect(assessNvdVersion({ ...technology, version: "9.0" }, [{ negate: true, nodes: [{ cpeMatch: [match] }] }])).toBe(
    "unknown",
  );
});
