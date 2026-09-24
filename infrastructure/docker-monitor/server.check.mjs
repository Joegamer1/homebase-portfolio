import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMonitor, filterTailscale } from "./server.mjs";

test("telemetry adapter enforces address, methods, paths and field filtering", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hb-proxy-"));
  const socketPath = join(dir, "docker.sock");
  let calls = 0;
  const upstream = http.createServer((req, res) => {
    calls++;
    res.end(
      JSON.stringify(
        req.url.startsWith("/containers/json?")
          ? [{ Id: "a".repeat(64), Labels: { secret: "hidden" } }]
          : {
              Name: "/plex",
              RestartCount: 0,
              Config: { Image: "plex:1", Env: ["TOKEN=secret"] },
              State: {
                Status: "running",
                StartedAt: "2026-09-08T00:00:00Z",
                Health: { Status: "healthy", Log: ["secret"] },
              },
            },
      ),
    );
  });
  await new Promise((resolve) => upstream.listen(socketPath, resolve));
  const server = createMonitor({ socketPath, allowedAddress: "127.0.0.1" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(base + "/containers/json?all=1")).json(), [{ Id: "a".repeat(64) }]);
    const inspection = await (await fetch(base + `/containers/${"a".repeat(64)}/json`)).text();
    assert(!inspection.includes("secret"));
    assert(inspection.includes("healthy"));
    assert.equal((await fetch(base + "/containers/json?all=1", { method: "POST" })).status, 405);
    assert.equal((await fetch(base + "/info")).status, 404);
    assert.equal((await fetch(base + `/containers/${"a".repeat(64)}/archive?path=/`)).status, 404);
    const tailnet = JSON.stringify(
      filterTailscale({
        BackendState: "Running",
        Version: "1.0",
        Self: { HostName: "docker", Online: true, Secret: "hidden" },
        Peer: { one: { HostName: "homebase", Online: true, LastSeen: "now", Secret: "hidden" } },
      }),
    );
    assert(tailnet.includes('"backendState":"Running"'));
    assert(tailnet.includes('"hostName":"homebase"'));
    assert(!tailnet.includes("Secret"));
    assert.equal(calls, 2);
    const denied = createMonitor({ socketPath, allowedAddress: "192.0.2.1" });
    await new Promise((resolve) => denied.listen(0, "127.0.0.1", resolve));
    assert.equal((await fetch(`http://127.0.0.1:${denied.address().port}/containers/json?all=1`)).status, 403);
    await new Promise((resolve) => denied.close(resolve));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
