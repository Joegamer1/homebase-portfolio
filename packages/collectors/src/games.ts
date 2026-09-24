import { DEADLOCK_NEWS_URL, normalizeDeadlockNews } from "./deadlock.js";
import { createHash } from "node:crypto";
import type { GameName, GameProfile, GameSnapshot, GameUpdateRecord } from "@homebase/domain";
export interface GameSourceConfig {
  game: GameName;
  url: string;
  timeoutMs?: number;
}
const hash = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 24);
const clean = (v: string) =>
  v
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function classifyUpdate(text: string): GameUpdateRecord["classification"] {
  const buff =
    /\b(buffing|buffed|buff up|improve|improving|more power|more early agency|more punchy|power up|room (?:for power|to bring up)|giv(?:e|ing) .* (?:some love|power|more)|use some love|rais(?:e|ing) .* floor|boost|compensat(?:e|ing)|in (?:his|her|their) favor|help(?:ing)?(?: .*?)? out|making it up|failing to scale|underwhelming|(?:power|damage) .* limp|snowball(?:ing)? (?:dependant|reliant))\b/i.test(
      text,
    );
  const nerf =
    /\b(nerfing|nerfed|decrease|decreasing|reduce|reducing|weaken|weaker|ton(?:e|ing)(?: .*?)? down|tap(?:ping)?(?: .*?)? down|bring(?:ing)?(?: .*?)? down|pull(?:ing)? .* power out|target .* durability|lowering|overperforming|strong (?:spot|state)|high winrate|soften .* ability|add .* risk|constrain(?:ing)? .* power|due (?:for )?(?:a )?.* nerf)\b/i.test(
      text,
    );
  return buff ? (nerf ? "mixed" : "buff") : nerf ? "nerf" : "unclear";
}
export function normalizePatchHtml(
  config: GameSourceConfig,
  html: string,
  collectedAt = new Date().toISOString(),
  profile: GameProfile = { tracked: [], queues: [], roles: [] },
): GameUpdateRecord[] {
  if (config.game !== "league-of-legends" || /Checking your browser|challenge\/verify/i.test(html))
    throw new Error("Unsupported patch page");
  const date = html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1];
  const patch = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").match(/patch\s+(\d+\.\d+)/i)?.[1];
  if (!date || !Number.isFinite(Date.parse(date)) || !patch) throw new Error("Patch metadata unavailable");
  const blocks = [...html.matchAll(/<h3\b[^>]*class="change-title"[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h[23]\b|$)/gi)];
  const updates = blocks.flatMap((block): GameUpdateRecord[] => {
    const entity = clean(block[1]!);
    const context = clean(
      block[2]!.match(/<blockquote\b[^>]*class="[^"]*context[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i)?.[1] ?? "",
    );
    const lines = [...block[2]!.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => clean(m[1]!)).filter(Boolean);
    if (!entity || !lines.length) return [];
    const tracked = profile.tracked.find(
      (t) => t.game === config.game && t.name.toLowerCase() === entity.toLowerCase(),
    );
    return [
      {
        id: hash(config.url + ":" + entity.toLowerCase()),
        game: config.game,
        gameLabel: "League of Legends",
        patch,
        title: entity,
        entity,
        entityId: tracked?.entityId,
        category: /\/champions\//i.test(block[1]!) ? "stats" : "item",
        classification: classifyUpdate(context),
        summary: (context || lines.slice(0, 2).join(" · ")).slice(0, 500),
        confirmedChange: lines.join("\n").slice(0, 16000),
        source: "Riot Games",
        sourceUrl: config.url,
        publishedAt: new Date(date).toISOString(),
        collectedAt,
        relevanceTier: tracked ? (tracked.kind === "item" ? 2 : 1) : 5,
        relevanceReason: tracked
          ? "Changes to your tracked " + tracked.kind + ": " + tracked.name
          : "Untracked entity; available in game and history views.",
        saved: false,
        read: false,
        dismissed: false,
      },
    ];
  });
  if (!updates.length) throw new Error("No supported patch sections found");
  return updates;
}
export class OfficialGamePatchCollector {
  constructor(
    private readonly configs: GameSourceConfig[],
    private readonly request = fetch,
  ) {}
  private async page(url: string, config: GameSourceConfig) {
    const target = new URL(url);
    if (!target.pathname.endsWith("/")) target.pathname += "/";
    const host = config.game === "league-of-legends" ? "www.leagueoflegends.com" : "forums.playdeadlock.com";
    if (target.protocol !== "https:" || target.hostname !== host || target.username || target.password)
      throw new Error("Unsupported source host");
    const response = await this.request(target.href, {
      signal: AbortSignal.timeout(config.timeoutMs ?? 15000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Source unavailable");
    const text = await response.text();
    if (text.length > 4000000 || /Checking your browser|challenge\/verify/i.test(text))
      throw new Error("Source requires browser verification");
    return text;
  }
  async collect(profile: GameProfile): Promise<GameSnapshot> {
    const collectedAt = new Date().toISOString();
    const results = await Promise.allSettled(
      this.configs.map(async (config) => {
        if (config.game === "deadlock") {
          const response = await this.request(DEADLOCK_NEWS_URL, {
            signal: AbortSignal.timeout(config.timeoutMs ?? 15000),
            redirect: "error",
          });
          if (!response.ok) throw new Error(`Steam news returned HTTP ${response.status}`);
          const body = await response.text();
          if (body.length > 4000000) throw new Error("Steam news response too large");
          return normalizeDeadlockNews(JSON.parse(body), profile, collectedAt);
        }
        const index = await this.page(config.url, config);
        const links = [
          ...new Set(
            [...index.matchAll(/href="([^" ]*\/en-us\/news\/game-updates\/[^" ]*patch-[^" ]*notes\/?)"/g)].map(
              (m) => new URL(m[1]!, config.url).href,
            ),
          ),
        ].slice(0, 6);
        if (!links.length) return normalizePatchHtml(config, index, collectedAt, profile);
        const updates: GameUpdateRecord[] = [];
        for (const url of links)
          updates.push(...normalizePatchHtml({ ...config, url }, await this.page(url, config), collectedAt, profile));
        return updates;
      }),
    );
    return {
      source: "games",
      collectedAt,
      stale: results.some((r) => r.status === "rejected"),
      configured: true,
      profile,
      updates: results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
      providers: results.map((r, i) => ({
        source:
          this.configs[i]!.game === "deadlock"
            ? "https://store.steampowered.com/news/app/1422450"
            : this.configs[i]!.url,
        game: this.configs[i]!.game,
        state: r.status === "fulfilled" ? "healthy" : "down",
        itemCount: r.status === "fulfilled" ? r.value.length : 0,
        message:
          r.status === "rejected"
            ? "Automatic collection unavailable. Open the official source; cached changes may be stale."
            : this.configs[i]!.game === "deadlock"
              ? "Official Valve announcements from Steam; supported patch sections from the latest ten posts."
              : "Supported entity sections from up to six recent patches. Other sections may be omitted.",
      })),
      signals: [],
    };
  }
}
