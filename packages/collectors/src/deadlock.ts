import { createHash } from "node:crypto";
import type { GameProfile, GameUpdateRecord } from "@homebase/domain";

export const DEADLOCK_NEWS_URL =
  "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1422450&count=10&maxlength=0&feeds=steam_community_announcements";
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const plain = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\/?(?:b|i|u|url|h[1-6]|list|\*|img)(?:=[^\]]*)?\]/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\\\[/g, "[")
    .trim();

export function normalizeDeadlockNews(
  payload: unknown,
  profile: GameProfile,
  collectedAt = new Date().toISOString(),
): GameUpdateRecord[] {
  const news = object(object(payload).appnews);
  if (news.appid !== 1422450 || !Array.isArray(news.newsitems)) throw new Error("Invalid Deadlock news response");
  const updates: GameUpdateRecord[] = [];
  for (const value of news.newsitems) {
    const item = object(value);
    if (
      item.appid !== 1422450 ||
      item.feedname !== "steam_community_announcements" ||
      typeof item.gid !== "string" ||
      !/^\d+$/.test(item.gid) ||
      typeof item.title !== "string" ||
      typeof item.contents !== "string" ||
      typeof item.date !== "number"
    )
      continue;
    if (!/update|patch|hotfix/i.test(item.title)) continue;
    const published = new Date(item.date * 1000);
    if (!Number.isFinite(published.getTime())) continue;
    let url: URL;
    try {
      url = new URL(String(item.url));
    } catch {
      continue;
    }
    if (
      url.protocol !== "https:" ||
      !["steamstore-a.akamaihd.net", "store.steampowered.com", "steamcommunity.com"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      continue;
    const lines = item.contents
      .replace(/\[\/?p\]|\[br\]|<br\s*\/?\s*>|<\/p>/gi, "\n")
      .split(/\n/)
      .map(plain)
      .filter(Boolean);
    let section = "General";
    const groups = new Map<string, { entity: string; section: string; lines: string[] }>();
    for (const line of lines) {
      const heading = line.match(/^\[\s*(General|Items|Heroes|Miscellaneous)\s*\]$/i);
      if (heading) {
        section = heading[1]!;
        continue;
      }
      if (!/^[-•]\s+/.test(line)) continue;
      const change = line.replace(/^[-•]\s+/, "");
      const entity = change.match(/^([^:]{1,60}):\s/)?.[1] ?? section;
      const key = `${section}:${entity}`;
      const group = groups.get(key) ?? { entity, section, lines: [] };
      group.lines.push(change);
      groups.set(key, group);
    }
    for (const [key, group] of groups) {
      const tracked = profile.tracked.find(
        (t) => t.game === "deadlock" && t.name.toLowerCase() === group.entity.toLowerCase(),
      );
      updates.push({
        id: createHash("sha256").update(`deadlock:${item.gid}:${key}`).digest("hex").slice(0, 24),
        game: "deadlock",
        gameLabel: "Deadlock",
        patch: item.title,
        title: group.entity,
        entity: group.entity,
        entityId: tracked?.entityId,
        category: /^items$/i.test(group.section) ? "item" : /^heroes$/i.test(group.section) ? "ability" : "other",
        // Numeric increases can be buffs or nerfs depending on the stat; do not guess.
        classification: "unclear",
        summary: group.lines.slice(0, 2).join(" · ").slice(0, 500),
        confirmedChange: group.lines.join("\n").slice(0, 16000),
        source: "Valve / Steam",
        sourceUrl: url.href,
        publishedAt: published.toISOString(),
        collectedAt,
        relevanceTier: tracked ? 1 : 5,
        relevanceReason: tracked
          ? `Official changes to your tracked ${tracked.kind}: ${tracked.name}`
          : "Official patch notes; available in Deadlock and history views.",
        saved: false,
        read: false,
        dismissed: false,
      });
    }
  }
  if (!updates.length) throw new Error("No supported Deadlock patch changes returned");
  return updates;
}
