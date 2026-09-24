import { describe, expect, it, vi } from "vitest";
import { ServiceCollector, parseKumaMetrics } from "./services.js";

const metrics =
  'monitor_status{monitor_name="Plex",monitor_id="1"} 0\nmonitor_response_time{monitor_name="Plex",monitor_id="1"} 23\nmonitor_status{monitor_name="DNS",monitor_id="2"} 3';
describe("service collectors", () => {
  it("parses Kuma availability, latency and maintenance without leaking target labels", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(metrics));
    const result = await new ServiceCollector(
      { source: "uptime-kuma", baseUrl: "http://kuma", apiKey: "secret" },
      request,
    ).collect();
    expect(result.services.map((s) => s.state)).toEqual(["down", "maintenance"]);
    expect(result.services[0].latencyMs).toBe(23);
    expect(result.signals).toHaveLength(1);
    expect(request.mock.calls[0][1]?.headers).toEqual({
      Authorization: `Basic ${Buffer.from(":secret").toString("base64")}`,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("rejects login pages, absent status and unknown statuses", () => {
    for (const text of [
      "<html>Login</html>",
      'monitor_status{monitor_name="x"} 7',
      'monitor_response_time{monitor_name="x"} 5',
    ])
      expect(() => parseKumaMetrics(text)).toThrow();
  });
  it("handles escaped names, NaN latency and duplicate names with distinct targets", () => {
    const result = parseKumaMetrics(
      'monitor_status{monitor_name="a\\\"b",monitor_url="http://one?secret=x"} 1\nmonitor_status{monitor_name="a\\\"b",monitor_url="http://two"} 2\nmonitor_response_time{monitor_name="a\\\"b",monitor_url="http://two"} NaN',
    );
    expect(result[0].name).toBe('a"b');
    expect(result[0].id).not.toBe(result[1].id);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result[1].latencyMs).toBeUndefined();
  });
  it("normalizes Docker inspect, suppresses expected stops and never exposes environment", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ Id: "a".repeat(64) }, { Id: "b".repeat(64) }])))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Name: "/job",
            State: { Status: "exited" },
            Config: { Image: "job:1", Env: ["PASSWORD=secret"] },
            RestartCount: 0,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Name: "/plex",
            State: { Status: "running", StartedAt: new Date().toISOString(), Health: { Status: "unhealthy" } },
            Config: { Image: "plex:1" },
            RestartCount: 6,
          }),
        ),
      );
    const result = await new ServiceCollector(
      { source: "docker", baseUrl: "http://proxy", expectedDownNames: new Set(["job"]) },
      request,
    ).collect();
    expect(result.signals).toHaveLength(1);
    expect(result.services[0].uptimeSeconds).toBe(0);
    expect(JSON.stringify(result)).not.toContain("PASSWORD");
    expect(request.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  });
  it("fails on partial inspection errors and reports safe connection health", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("denied", { status: 403 }));
    const collector = new ServiceCollector({ source: "docker", baseUrl: "http://proxy" }, request);
    await expect(collector.collect()).rejects.toThrow("403");
    expect((await collector.testConnection()).state).toBe("down");
  });
});
