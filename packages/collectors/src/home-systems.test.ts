import { describe, expect, it, vi } from "vitest";
import {
  HomeSystemCollector,
  normalizeHomeAssistant,
  normalizePihole,
  normalizePlex,
  normalizeTailscale,
} from "./home-systems.js";

const now = "2026-09-08T12:00:00.000Z";

describe("home-system normalization", () => {
  it("summarizes Pi-hole and alerts when blocking is disabled", () => {
    const result = normalizePihole(
      {
        blocking: "disabled",
        queries: { total: 1200, blocked: 300, percent_blocked: 25 },
        clients: { active: 8 },
        gravity: { domains_being_blocked: 120000 },
      },
      now,
    );
    expect(result.metrics.find((item) => item.key === "blocked")?.value).toBe("300 (25.0%)");
    expect(result.signals[0].id).toContain("pihole:");
  });

  it("summarizes Plex sessions without exposing media metadata", () => {
    const result = normalizePlex(
      { MediaContainer: { friendlyName: "Lab Plex", version: "1.2.3" } },
      {
        MediaContainer: {
          Metadata: [
            {
              sessionKey: "1",
              title: "Episode",
              type: "episode",
              User: [{ title: "the owner" }],
              Player: [{ title: "TV" }],
              TranscodeSession: [{ id: "transcode-1", videoDecision: "transcode" }],
              summary: "private plot text",
            },
          ],
        },
      },
      { MediaContainer: { Directory: [{ title: "Movies" }, { title: "TV" }] } },
      now,
    );
    expect(result.metrics.find((item) => item.key === "transcodes")?.value).toBe("1");
    expect(result.entities[0]).toMatchObject({ name: "Episode", state: "transcoding", detail: "the owner · TV" });
    expect(JSON.stringify(result)).not.toContain("private plot");
  });

  it("bounds Home Assistant entity details and creates meaningful signals", () => {
    const states = Array.from({ length: 105 }, (_, index) => ({
      entity_id: index === 0 ? "automation.backup" : `sensor.device_${index}`,
      state: "unavailable",
      attributes: { friendly_name: `Device ${index}`, secret: "hidden" },
    }));
    const result = normalizeHomeAssistant({ version: "2026.9", location_name: "Home" }, states, now);
    expect(result.entities).toHaveLength(100);
    expect(result.signals.length).toBe(2);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("summarizes Tailscale peers and alerts only when the backend is not running", () => {
    const running = normalizeTailscale(
      {
        backendState: "Running",
        peers: [
          { hostName: "online", online: true },
          { hostName: "offline", online: false },
        ],
      },
      now,
    );
    expect(running.entities).toHaveLength(1);
    expect(running.signals).toHaveLength(0);
    expect(normalizeTailscale({ BackendState: "Stopped", Peer: [] }, now).signals).toHaveLength(1);
  });
});

describe("home-system collectors", () => {
  it("uses a short-lived Pi-hole session and logs it out", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { valid: true, sid: "session-id" } })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ blocking: "enabled", queries: {}, clients: {}, gravity: {} })),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await new HomeSystemCollector(
      { source: "pihole", baseUrl: "https://pihole.local", credential: "app-password" },
      request,
    ).collect();
    expect(result.source).toBe("pihole");
    expect(request.mock.calls[1][1]?.headers).toEqual({ "X-FTL-SID": "session-id" });
    expect(request.mock.calls[2][1]?.method).toBe("DELETE");
    expect(JSON.stringify(result)).not.toContain("app-password");
  });

  it("sends provider credentials in headers and returns safe health failures", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("denied", { status: 401 }));
    const collector = new HomeSystemCollector(
      { source: "home-assistant", baseUrl: "http://ha.local", credential: "secret" },
      request,
    );
    expect((await collector.testConnection()).state).toBe("down");
    expect(request.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer secret" });
  });

  it("rejects URLs with embedded credentials", async () => {
    const collector = new HomeSystemCollector({ source: "tailscale", baseUrl: "http://user:pass@host/status" });
    await expect(collector.collect()).rejects.toThrow("Invalid provider URL");
  });
});

it("does not declare missing Pi-hole blocking state healthy", () => {
  expect(normalizePihole({}, now).metrics.find((item) => item.key === "blocking")).toMatchObject({
    value: "Unknown",
    state: "warning",
  });
});
it("rejects malformed Home Assistant state payloads", () => {
  expect(() => normalizeHomeAssistant({}, {}, now)).toThrow("Invalid Home Assistant state list");
});

const plex = (container: Record<string, unknown>) =>
  normalizePlex({ MediaContainer: {} }, { MediaContainer: container }, { MediaContainer: {} }, now);
const value = (result: ReturnType<typeof plex>, key: string) => result.metrics.find((m) => m.key === key)?.value;

describe("Plex session shapes", () => {
  const movie = {
    sessionKey: 42,
    title: "Movie",
    type: "movie",
    User: { title: "the owner" },
    Player: { title: "TV" },
  };
  const episode = {
    Session: [{ id: "episode-session" }],
    title: "Episode",
    grandparentTitle: "Show",
    type: "episode",
    User: [{ title: "Sam" }],
    Player: [{ title: "Tablet" }],
    TranscodeSession: { key: "/transcode/private", videoDecision: "transcode" },
    summary: "private plot text",
  };

  it("counts Metadata, normalizes objects and arrays, and preserves IDs across ordering", () => {
    const result = plex({ Metadata: [movie, episode], Video: [movie] });
    expect(value(result, "sessions")).toBe("2");
    expect(value(result, "transcodes")).toBe("1");
    expect(result.entities[0]).toMatchObject({
      name: "Movie",
      kind: "movie",
      state: "direct-play",
      detail: "the owner · TV",
    });
    expect(result.entities[1]).toMatchObject({
      name: "Show",
      kind: "episode",
      state: "transcoding",
      detail: "Sam · Tablet",
    });
    expect(plex({ Metadata: [episode, movie] }).entities.map((e) => e.id)).toEqual(
      result.entities.map((e) => e.id).reverse(),
    );
    expect(JSON.stringify(result)).not.toMatch(/private plot|transcode\/private/);
  });

  it("supports legacy sessions, all media kinds, and absent nested objects", () => {
    const result = plex({
      Video: [movie],
      Track: [{ sessionKey: "music", type: "track", parentTitle: "Album" }],
      Photo: [{ sessionKey: "photo", type: "photo", title: "Photo" }],
    });
    expect(value(result, "sessions")).toBe("3");
    expect(value(result, "transcodes")).toBe("0");
    expect(result.entities[1]).toMatchObject({ name: "Album", kind: "track", state: "direct-play" });
    expect(value(plex({ Metadata: [{ type: "clip" }] }), "sessions")).toBe("1");
  });

  it.each([{}, { Metadata: [] }, { Video: [] }])("handles zero sessions: %j", (container) => {
    const result = plex(container);
    expect(value(result, "sessions")).toBe("0");
    expect(value(result, "transcodes")).toBe("0");
    expect(result.entities).toEqual([]);
  });

  it("does not count direct-stream remuxes or empty transcode objects as transcoding", () => {
    const result = plex({
      Metadata: [
        { ...movie, TranscodeSession: { videoDecision: "copy", audioDecision: "copy" } },
        { ...episode, TranscodeSession: [{ videoDecision: "copy", audioDecision: "transcode" }] },
        { sessionKey: "empty", TranscodeSession: {} },
      ],
    });
    expect(value(result, "transcodes")).toBe("1");
    expect(result.entities.map((e) => e.state)).toEqual(["direct-play", "transcoding", "direct-play"]);
  });

  it("counts all streams while bounding displayed entities and deduplicating identifiers", () => {
    const rows = Array.from({ length: 55 }, (_, sessionKey) => ({
      ...movie,
      sessionKey,
      TranscodeSession: { id: String(sessionKey), videoDecision: "transcode" },
    }));
    const result = plex({ Metadata: [...rows, rows[0]], Video: rows });
    expect(value(result, "sessions")).toBe("55");
    expect(value(result, "transcodes")).toBe("55");
    expect(result.entities).toHaveLength(50);
  });

  it("rejects malformed nested objects without weakening provider validation", () => {
    expect(() => plex({ Metadata: [{ User: "invalid" }] })).toThrow("Invalid provider response");
  });
});

it("collects Plex JSON sessions using the authenticated sessions endpoint", async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const path = new URL(String(url)).pathname;
    return new Response(
      JSON.stringify({
        MediaContainer:
          path === "/status/sessions"
            ? { Metadata: [{ sessionKey: "1", title: "Movie", User: { title: "the owner" } }] }
            : {},
      }),
    );
  });
  const result = await new HomeSystemCollector(
    { source: "plex", baseUrl: "http://plex.local", credential: "private-token" },
    request,
  ).collect();
  expect(value(result, "sessions")).toBe("1");
  expect(request.mock.calls.map(([url]) => new URL(String(url)).pathname)).toContain("/status/sessions");
  expect(request.mock.calls[1][1]?.headers).toEqual({ Accept: "application/json", "X-Plex-Token": "private-token" });
  expect(JSON.stringify(result)).not.toContain("private-token");
});
