import { describe, expect, it } from "vitest";
import { classifyUpdate, normalizePatchHtml } from "./games.js";
const config = {
  game: "league-of-legends" as const,
  url: "https://www.leagueoflegends.com/en-us/news/game-updates/patch-1-2-notes",
};
const html =
  '<title>Patch 1.2 Notes</title><script>{"datePublished":"2026-09-01T00:00:00Z"}</script><h3 class="change-title"><a href="/en-us/champions/yunara/">Yunara</a></h3><blockquote class="blockquote context"><p>We are buffing her scaling.</p></blockquote><ul><li>Damage: 20 ⇒ 25</li></ul><h3 class="change-title"><a href="/en-us/champions/unrelated/">Unrelated</a></h3><blockquote class="blockquote context"><p>Power is moving between two abilities, buffing one and reducing another.</p></blockquote><ul><li>Armor: 10 ⇒ 12</li></ul>';
describe("game patch normalization", () => {
  it("extracts source values, dates and explicit roster relevance", () => {
    const updates = normalizePatchHtml(config, html, "2026-09-10T00:00:00Z", {
      tracked: [{ game: config.game, entityId: "yunara", name: "Yunara", kind: "champion" }],
      queues: [],
      roles: [],
    });
    expect(updates[0]).toMatchObject({
      entity: "Yunara",
      relevanceTier: 1,
      confirmedChange: "Damage: 20 ⇒ 25",
      classification: "buff",
      category: "stats",
      publishedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(updates[1]?.relevanceTier).toBe(5);
    expect(updates[1]?.classification).toBe("mixed");
    expect(normalizePatchHtml(config, html)[0]?.id).toBe(updates[0]?.id);
  });
  it("rejects index headings and browser challenges", () => {
    expect(() => normalizePatchHtml(config, "<h2>Patch notes</h2>")).toThrow();
    expect(() => normalizePatchHtml(config, "<title>Checking your browser</title>")).toThrow();
  });
  it("does not infer buff direction from numbers or bare cooldown language", () =>
    expect(classifyUpdate("Cooldown increased")).toBe("unclear"));
  it("uses current intent instead of historical buff and nerf mentions", () => {
    expect(classifyUpdate("She climbed after recent item buffs, so we are pulling some power out of her burst.")).toBe(
      "nerf",
    );
    expect(classifyUpdate("He has not recovered since earlier nerfs, so we are providing more early agency.")).toBe(
      "buff",
    );
    expect(classifyUpdate("This might read as a nerf, but we are using it to give him some love.")).toBe("buff");
  });
});
