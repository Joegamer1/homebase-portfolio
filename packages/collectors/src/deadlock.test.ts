import { expect, it, vi } from "vitest";
import { normalizeDeadlockNews } from "./deadlock.js";
import { OfficialGamePatchCollector } from "./games.js";
const item = {
  appid: 1422450,
  gid: "12345",
  title: "Minor Update - 09-16-2026",
  date: 1789589803,
  feedname: "steam_community_announcements",
  url: "https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/12345",
  contents:
    "[p][b]\\[ Heroes ][/b][/p][p]- Holliday: Health increased from 41 to 43[/p][p]- Holliday: Lasso duration increased[/p][p]- Pocket: Fixed a targeting bug[/p]",
};
const profile = {
  tracked: [{ game: "deadlock" as const, entityId: "holliday", name: "Holliday", kind: "hero" as const }],
  queues: [],
  roles: [],
};
const payload = { appnews: { appid: 1422450, newsitems: [item] } };
it("groups dated official changes by entity and prioritizes tracked heroes", () => {
  const rows = normalizeDeadlockNews(payload, profile);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    entity: "Holliday",
    relevanceTier: 1,
    classification: "unclear",
    source: "Valve / Steam",
  });
  expect(rows[0]?.confirmedChange).toContain("41 to 43\nHolliday");
  expect(rows[1]?.relevanceTier).toBe(5);
  expect(normalizeDeadlockNews(payload, profile)[0]?.id).toBe(rows[0]?.id);
});
it("rejects unrelated feeds, unsafe links and empty or malformed responses", () => {
  for (const replacement of [
    { ...item, feedname: "pcgamer" },
    { ...item, appid: 1 },
    { ...item, url: "http://127.0.0.1/" },
    { ...item, contents: "Checking your browser" },
  ])
    expect(() => normalizeDeadlockNews({ appnews: { appid: 1422450, newsitems: [replacement] } }, profile)).toThrow();
});
it("uses the official Steam API instead of the blocked forum", async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
  const result = await new OfficialGamePatchCollector(
    [{ game: "deadlock", url: "https://forums.playdeadlock.com/forums/changelog.10/" }],
    request,
  ).collect(profile);
  expect(result.stale).toBe(false);
  expect(result.providers[0]?.state).toBe("healthy");
  expect(String(request.mock.calls[0]?.[0])).toContain("api.steampowered.com/ISteamNews");
});
