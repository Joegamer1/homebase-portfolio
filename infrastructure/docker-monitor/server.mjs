import http from "node:http";

// Private telemetry adapter. No arbitrary Docker paths or raw inspect responses.
export function createMonitor({
  socketPath = "/var/run/docker.sock",
  tailscaleSocketPath = "/var/run/tailscale/tailscaled.sock",
  allowedAddress = process.env.ALLOWED_ADDRESS,
} = {}) {
  return http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (!allowedAddress || req.socket.remoteAddress?.replace(/^::ffff:/, "") !== allowedAddress)
      return reply(403, { error: "Forbidden" });
    if (req.method !== "GET") return reply(405, { error: "Read only" });
    const isList = req.url === "/containers/json?all=1";
    const isInspect = /^\/containers\/[a-f0-9]{12,64}\/json$/.test(req.url ?? "");
    const isTailscale = req.url === "/tailscale/status";
    if (!isList && !isInspect && !isTailscale) return reply(404, { error: "Not found" });
    try {
      if (isTailscale) {
        const raw = await readTailscale(tailscaleSocketPath);
        return reply(200, filterTailscale(raw));
      }
      const raw = await new Promise((resolve, reject) => {
        const upstream = http.get({ socketPath, path: req.url, timeout: 5000 }, (response) => {
          if (response.statusCode !== 200) {
            response.resume();
            reject(new Error("Docker unavailable"));
            return;
          }
          const chunks = [];
          let bytes = 0;
          response.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > 4 * 1024 * 1024) {
              response.destroy();
              reject(new Error("Response limit"));
            } else chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString()));
            } catch (error) {
              reject(error);
            }
          });
        });
        upstream.on("timeout", () => upstream.destroy(new Error("Timeout")));
        upstream.on("error", reject);
      });
      if (isList)
        return reply(
          200,
          raw.map((item) => ({ Id: item.Id })),
        );
      return reply(200, {
        Name: raw.Name,
        RestartCount: raw.RestartCount,
        Config: { Image: raw.Config?.Image },
        State: {
          Status: raw.State?.Status,
          StartedAt: raw.State?.StartedAt,
          ...(raw.State?.Health ? { Health: { Status: raw.State.Health.Status } } : {}),
        },
      });
    } catch {
      reply(502, { error: "Docker telemetry unavailable" });
    }
  });
}

export function filterTailscale(raw) {
  const peers = Object.values(raw.Peer ?? {}).map((peer) => ({
    hostName: peer.HostName,
    online: peer.Online,
    lastSeen: peer.LastSeen,
  }));
  return {
    backendState: raw.BackendState,
    version: raw.Version,
    self: raw.Self ? { hostName: raw.Self.HostName, online: raw.Self.Online } : undefined,
    peers,
  };
}

function readTailscale(socketPath) {
  return new Promise((resolve, reject) => {
    const upstream = http.get(
      { socketPath, path: "/localapi/v0/status", headers: { Host: "local-tailscaled.sock" }, timeout: 5000 },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error("Telemetry source unavailable"));
          return;
        }
        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 4 * 1024 * 1024) {
            response.destroy();
            reject(new Error("Response limit"));
          } else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    upstream.on("timeout", () => upstream.destroy(new Error("Timeout")));
    upstream.on("error", reject);
  });
}
if (process.argv[1]?.endsWith("server.mjs"))
  createMonitor().listen(Number(process.env.PORT ?? 23750), process.env.LISTEN_ADDRESS ?? "127.0.0.1");
