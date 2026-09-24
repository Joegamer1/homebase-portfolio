import { createHash } from "node:crypto";
import type {
  Collector,
  CollectorHealth,
  HomeSystemEntity,
  HomeSystemMetric,
  HomeSystemSnapshot,
  HomeSystemSource,
  RawAttentionSignal,
} from "@homebase/domain";

export interface HomeSystemCollectorConfig {
  source: HomeSystemSource;
  baseUrl: string;
  credential?: string;
  timeoutMs?: number;
}

type Json = Record<string, unknown>;

const record = (value: unknown): Json => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid provider response");
  return value as Json;
};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const number = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const string = (value: unknown): string => (typeof value === "string" ? value : "");
const stableId = (source: string, value: string) => createHash("sha256").update(`${source}:${value}`).digest("hex");

export class HomeSystemCollector implements Collector<HomeSystemSnapshot> {
  readonly name: string;
  constructor(
    private readonly config: HomeSystemCollectorConfig,
    private readonly request = fetch,
  ) {
    this.name = config.source;
  }

  private url(path: string) {
    const url = new URL(this.config.baseUrl.replace(/\/$/, "") + path);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new Error("Invalid provider URL");
    return url;
  }

  private async fetchJson(path: string, headers: Record<string, string>, signal: AbortSignal): Promise<Json> {
    const response = await this.request(this.url(path), { method: "GET", headers, signal, redirect: "error" });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    return record(await response.json());
  }

  async collect(): Promise<HomeSystemSnapshot> {
    const signal = AbortSignal.timeout(this.config.timeoutMs ?? 10000);
    switch (this.config.source) {
      case "pihole":
        return this.collectPihole(signal);
      case "plex":
        return this.collectPlex(signal);
      case "home-assistant":
        return this.collectHomeAssistant(signal);
      case "tailscale":
        return this.collectTailscale(signal);
    }
  }

  private async collectPihole(signal: AbortSignal): Promise<HomeSystemSnapshot> {
    if (!this.config.credential) throw new Error("Pi-hole application password is not configured");
    const auth = await this.request(this.url("/api/auth"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: this.config.credential }),
      signal,
      redirect: "error",
    });
    if (!auth.ok) throw new Error(`Provider returned HTTP ${auth.status}`);
    const session = record(record(await auth.json()).session);
    const sid = string(session.sid);
    if (!session.valid || !sid || sid.length > 256) throw new Error("Invalid Pi-hole session");
    try {
      const summary = await this.fetchJson("/api/stats/summary", { "X-FTL-SID": sid }, signal);
      return normalizePihole(summary, new Date().toISOString());
    } finally {
      await this.request(this.url("/api/auth"), {
        method: "DELETE",
        headers: { "X-FTL-SID": sid },
        signal: AbortSignal.timeout(3000),
        redirect: "error",
      }).catch(() => undefined);
    }
  }

  private async collectPlex(signal: AbortSignal): Promise<HomeSystemSnapshot> {
    if (!this.config.credential) throw new Error("Plex token is not configured");
    const headers = { Accept: "application/json", "X-Plex-Token": this.config.credential };
    const [server, sessions, libraries] = await Promise.all([
      this.fetchJson("/", headers, signal),
      this.fetchJson("/status/sessions", headers, signal),
      this.fetchJson("/library/sections", headers, signal),
    ]);
    return normalizePlex(server, sessions, libraries, new Date().toISOString());
  }

  private async collectHomeAssistant(signal: AbortSignal): Promise<HomeSystemSnapshot> {
    if (!this.config.credential) throw new Error("Home Assistant token is not configured");
    const headers = { Authorization: `Bearer ${this.config.credential}`, Accept: "application/json" };
    const [configResponse, statesResponse] = await Promise.all([
      this.request(this.url("/api/config"), { method: "GET", headers, signal, redirect: "error" }),
      this.request(this.url("/api/states"), { method: "GET", headers, signal, redirect: "error" }),
    ]);
    if (!configResponse.ok || !statesResponse.ok)
      throw new Error(`Provider returned HTTP ${configResponse.ok ? statesResponse.status : configResponse.status}`);
    return normalizeHomeAssistant(
      record(await configResponse.json()),
      await statesResponse.json(),
      new Date().toISOString(),
    );
  }

  private async collectTailscale(signal: AbortSignal): Promise<HomeSystemSnapshot> {
    return normalizeTailscale(await this.fetchJson("", {}, signal), new Date().toISOString());
  }

  async testConnection(): Promise<CollectorHealth> {
    const checkedAt = new Date().toISOString();
    try {
      await this.collect();
      return { state: "healthy", checkedAt, lastSuccessAt: checkedAt, stale: false };
    } catch {
      return { state: "down", checkedAt, stale: false, message: "Home-system collection failed" };
    }
  }
}

function metric(key: string, label: string, value: string, state: HomeSystemMetric["state"] = "neutral") {
  return { key, label, value, state };
}

function attention(
  source: HomeSystemSource,
  entity: string,
  condition: string,
  title: string,
  summary: string,
  observedAt: string,
  severity: "medium" | "high" = "high",
): RawAttentionSignal {
  return {
    id: `${source}:${stableId(source, entity)}:${condition}`,
    domain: "lab",
    title,
    summary,
    severity,
    source,
    entity,
    observedAt,
    urgency: severity === "high" ? 85 : 55,
    relevance: 100,
    consequence: severity === "high" ? 75 : 55,
    recency: 100,
    confidence: 95,
    action: { label: "Review home system", href: "/lab/home-systems" },
  };
}

export function normalizePihole(raw: Json, collectedAt: string): HomeSystemSnapshot {
  const queries = record(raw.queries ?? {});
  const clients = record(raw.clients ?? {});
  const gravity = record(raw.gravity ?? {});
  const total = number(queries.total);
  const blocked = number(queries.blocked);
  const percent = number(queries.percent_blocked);
  const activeClients = number(clients.active);
  const blocking = raw.blocking === "enabled";
  const blockingKnown = blocking || raw.blocking === "disabled";
  const signals =
    !blockingKnown || blocking
      ? []
      : [
          attention(
            "pihole",
            "dns-blocking",
            "disabled",
            "Pi-hole blocking is disabled",
            "DNS queries are resolving without blocklist enforcement.",
            collectedAt,
          ),
        ];
  return {
    source: "pihole",
    collectedAt,
    stale: false,
    version: string(record(raw.version ?? {}).ftl),
    metrics: [
      metric(
        "blocking",
        "Blocking",
        blockingKnown ? (blocking ? "Active" : "Disabled") : "Unknown",
        blockingKnown ? (blocking ? "healthy" : "critical") : "warning",
      ),
      metric("queries", "Queries today", String(total)),
      metric("blocked", "Blocked", `${blocked} (${percent.toFixed(1)}%)`),
      metric("clients", "Active clients", String(activeClients)),
      metric("gravity", "Gravity domains", String(number(gravity.domains_being_blocked))),
    ],
    entities: [],
    signals,
  };
}

// Plex serializes nested elements as either objects or singleton arrays.
function plexObjects(value: unknown): Json[] {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map(record);
}

function plexIdentifier(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : string(value);
}

export function normalizePlex(
  serverRaw: Json,
  sessionsRaw: Json,
  librariesRaw: Json,
  collectedAt: string,
): HomeSystemSnapshot {
  const server = record(serverRaw.MediaContainer);
  const sessionsContainer = record(sessionsRaw.MediaContainer);
  const libraries = array(record(librariesRaw.MediaContainer).Directory);
  const metadataSessions = plexObjects(sessionsContainer.Metadata);
  const sessionRows = metadataSessions.length
    ? metadataSessions
    : [...array(sessionsContainer.Video), ...array(sessionsContainer.Track), ...array(sessionsContainer.Photo)];
  const seen = new Set<string>();
  const uniqueSessions = sessionRows.map(record).filter((item) => {
    const key = plexIdentifier(item.sessionKey) || plexIdentifier(plexObjects(item.Session)[0]?.id);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const entities: HomeSystemEntity[] = uniqueSessions.map((item, index) => {
    const user = plexObjects(item.User)[0] ?? {};
    const player = plexObjects(item.Player)[0] ?? {};
    const transcodes = plexObjects(item.TranscodeSession);
    // Remux/direct-stream sessions can have a TranscodeSession too.
    const transcode = transcodes.some((session) => {
      const decisions = [session.videoDecision, session.audioDecision, session.subtitleDecision].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      );
      return decisions.length ? decisions.includes("transcode") : Object.keys(session).length > 0;
    });
    const sessionId = plexIdentifier(item.sessionKey) || plexIdentifier(plexObjects(item.Session)[0]?.id);
    return {
      id: stableId("plex", sessionId || `index:${index}`),
      name: string(item.grandparentTitle) || string(item.parentTitle) || string(item.title) || "Active session",
      kind: string(item.type) || "media",
      state: transcode ? "transcoding" : "direct-play",
      detail: [string(user.title), string(player.title)].filter(Boolean).join(" · ") || undefined,
    };
  });
  const transcoding = entities.filter((item) => item.state === "transcoding").length;
  return {
    source: "plex",
    collectedAt,
    stale: false,
    version: string(server.version),
    metrics: [
      metric("server", "Server", string(server.friendlyName) || "Plex", "healthy"),
      metric("sessions", "Active streams", String(entities.length), entities.length ? "neutral" : "healthy"),
      metric("transcodes", "Transcodes", String(transcoding), transcoding ? "warning" : "healthy"),
      metric("libraries", "Libraries", String(libraries.length)),
    ],
    entities: entities.slice(0, 50),
    signals: [],
  };
}

export function normalizeHomeAssistant(config: Json, statesRaw: unknown, collectedAt: string): HomeSystemSnapshot {
  if (!Array.isArray(statesRaw)) throw new Error("Invalid Home Assistant state list");
  const states = statesRaw.map(record);
  const unavailable = states.filter((item) => ["unavailable", "unknown"].includes(string(item.state)));
  const failedAutomations = states.filter(
    (item) => string(item.entity_id).startsWith("automation.") && string(item.state) === "unavailable",
  );
  const updates = states.filter((item) => string(item.entity_id).startsWith("update.") && string(item.state) === "on");
  const entities = [
    ...failedAutomations,
    ...unavailable.filter((item) => !string(item.entity_id).startsWith("automation.")),
    ...updates,
  ]
    .slice(0, 100)
    .map((item) => {
      const attributes = record(item.attributes ?? {});
      const id = string(item.entity_id);
      return {
        id: stableId("home-assistant", id),
        name: string(attributes.friendly_name) || id,
        kind: id.split(".")[0] || "entity",
        state: string(item.state),
      };
    });
  const signals = [
    ...failedAutomations.map((item) =>
      attention(
        "home-assistant",
        string(item.entity_id),
        "unavailable",
        "Home Assistant automation unavailable",
        string(item.entity_id),
        collectedAt,
      ),
    ),
    ...(unavailable.length >= 10
      ? [
          attention(
            "home-assistant",
            "entities",
            "unavailable",
            `${unavailable.length} Home Assistant entities unavailable`,
            "Review unavailable devices and integrations.",
            collectedAt,
            "medium",
          ),
        ]
      : []),
  ];
  return {
    source: "home-assistant",
    collectedAt,
    stale: false,
    version: string(config.version),
    metrics: [
      metric("location", "Instance", string(config.location_name) || "Home Assistant", "healthy"),
      metric("entities", "Entities", String(states.length)),
      metric(
        "unavailable",
        "Unavailable",
        String(unavailable.length),
        unavailable.length >= 10 ? "warning" : "healthy",
      ),
      metric("updates", "Updates", String(updates.length), updates.length ? "warning" : "healthy"),
    ],
    entities,
    signals,
  };
}

export function normalizeTailscale(raw: Json, collectedAt: string): HomeSystemSnapshot {
  const backend = string(raw.backendState ?? raw.BackendState);
  const peers = array(raw.peers ?? raw.Peer).map(record);
  const offline = peers.filter((peer) => peer.online === false || peer.Online === false);
  const entities = offline.slice(0, 100).map((peer) => {
    const name = string(peer.hostName ?? peer.HostName) || "Unknown peer";
    return { id: stableId("tailscale", name), name, kind: "peer", state: "offline" };
  });
  const running = backend.toLowerCase() === "running";
  return {
    source: "tailscale",
    collectedAt,
    stale: false,
    version: string(raw.version ?? raw.Version),
    metrics: [
      metric("backend", "Tailnet", backend || "Unknown", running ? "healthy" : "critical"),
      metric("peers", "Peers", String(peers.length)),
      metric("online", "Online", String(peers.length - offline.length), "healthy"),
      metric("offline", "Offline", String(offline.length), offline.length ? "warning" : "healthy"),
    ],
    entities,
    signals: running
      ? []
      : [
          attention(
            "tailscale",
            "tailnet",
            "not-running",
            "Tailscale is not running",
            `Backend state: ${backend || "unknown"}.`,
            collectedAt,
          ),
        ],
  };
}
