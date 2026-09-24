import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { getAttention, getHealth, getHome, getIntegrations } from "./application.js";
import { getProxmox } from "./proxmox.js";

import { getService } from "./services.js";
import { getHomeSystem } from "./home-systems.js";
import { getSecurity } from "./security.js";
import { getCareer, importCareerJob, updateCareerJobStatus } from "./career.js";
import { getGames, updateGameState } from "./games.js";
import { getFamily, updateReminder, discoverFamilySources, updateFamilySelection } from "./family.js";

type Endpoint = () => Promise<unknown>;
const endpoints: Record<string, Endpoint> = {
  "/api/v1/health": getHealth,
  "/api/v1/home": getHome,
  "/api/v1/attention": getAttention,
  "/api/v1/integrations": getIntegrations,
  "/api/v1/proxmox": getProxmox,
  "/api/v1/docker": () => getService("docker"),
  "/api/v1/uptime-kuma": () => getService("uptime-kuma"),
  "/api/v1/pihole": () => getHomeSystem("pihole"),
  "/api/v1/plex": () => getHomeSystem("plex"),
  "/api/v1/home-assistant": () => getHomeSystem("home-assistant"),
  "/api/v1/tailscale": () => getHomeSystem("tailscale"),
  "/api/v1/security": getSecurity,
  "/api/v1/career": getCareer,
  "/api/v1/games": getGames,
  "/api/v1/family": getFamily,
  "/api/v1/family/discovery": discoverFamilySources,
};

function writeJson(response: ServerResponse, status: number, body: unknown, origin: string) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "content-type",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

export function createRequestHandler(webOrigin: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "OPTIONS") return writeJson(response, 204, null, webOrigin);
    const path = new URL(request.url ?? "/", "http://homebase.local").pathname;
    if (request.method === "POST" && path === "/api/v1/career/jobs/import") {
      if (request.headers.origin && request.headers.origin !== webOrigin)
        return writeJson(
          response,
          403,
          { error: { code: "ORIGIN_NOT_ALLOWED", message: "Mutation origin is not allowed." } },
          webOrigin,
        );
      let payload: unknown;
      try {
        let body = "";
        for await (const chunk of request) {
          body += String(chunk);
          if (body.length > 50000) throw new Error("Request too large");
        }
        payload = JSON.parse(body);
      } catch {
        return writeJson(
          response,
          400,
          { error: { code: "INVALID_IMPORT", message: "Invalid or oversized listing." } },
          webOrigin,
        );
      }
      try {
        return writeJson(response, 200, await importCareerJob(payload), webOrigin);
      } catch {
        return writeJson(
          response,
          400,
          {
            error: {
              code: "IMPORT_FAILED",
              message:
                "Could not save listing. Use a LinkedIn or Indeed job URL, a full description, and an eligible US remote location.",
            },
          },
          webOrigin,
        );
      }
    }
    const statusRoute = path.match(/^\/api\/v1\/career\/jobs\/([^/]+)\/status$/);
    if (request.method === "PATCH" && statusRoute) {
      if (request.headers.origin && request.headers.origin !== webOrigin)
        return writeJson(
          response,
          403,
          { error: { code: "ORIGIN_NOT_ALLOWED", message: "Mutation origin is not allowed." } },
          webOrigin,
        );
      try {
        let body = "";
        for await (const chunk of request) {
          body += String(chunk);
          if (body.length > 1024) throw new Error("Request body is too large");
        }
        const payload = JSON.parse(body) as { status?: unknown };
        return writeJson(
          response,
          200,
          await updateCareerJobStatus(decodeURIComponent(statusRoute[1]!), payload.status),
          webOrigin,
        );
      } catch {
        return writeJson(
          response,
          400,
          { error: { code: "INVALID_JOB_STATUS", message: "Use new, saved, applied, or dismissed." } },
          webOrigin,
        );
      }
    }
    const gameStateRoute = path.match(/^\/api\/v1\/games\/updates\/([^/]+)$/);
    if (request.method === "PATCH" && gameStateRoute) {
      if (request.headers.origin && request.headers.origin !== webOrigin)
        return writeJson(
          response,
          403,
          { error: { code: "ORIGIN_NOT_ALLOWED", message: "Mutation origin is not allowed." } },
          webOrigin,
        );
      try {
        let body = "";
        for await (const chunk of request) {
          body += String(chunk);
          if (body.length > 5000) throw new Error("too large");
        }
        return writeJson(
          response,
          200,
          await updateGameState(decodeURIComponent(gameStateRoute[1]!), JSON.parse(body)),
          webOrigin,
        );
      } catch {
        return writeJson(
          response,
          400,
          { error: { code: "INVALID_GAME_STATE", message: "Invalid game update state." } },
          webOrigin,
        );
      }
    }
    const reminderRoute = path.match(/^\/api\/v1\/family\/reminders(?:\/([^/]+))?$/);
    if (
      reminderRoute &&
      ((request.method === "POST" && !reminderRoute[1]) || (request.method === "PATCH" && reminderRoute[1]))
    ) {
      if (request.headers.origin && request.headers.origin !== webOrigin)
        return writeJson(
          response,
          403,
          { error: { code: "ORIGIN_NOT_ALLOWED", message: "Mutation origin is not allowed." } },
          webOrigin,
        );
      try {
        let body = "";
        for await (const chunk of request) {
          body += String(chunk);
          if (body.length > 5000) throw new Error("too large");
        }
        const payload = z
          .object({
            title: z.string().trim().min(1).max(200).optional(),
            dueAt: z.string().datetime({ offset: true }).optional(),
            completed: z.boolean().optional(),
          })
          .strict()
          .parse(JSON.parse(body));
        if (!reminderRoute[1] && !payload.title) throw new Error("Title required");
        return writeJson(
          response,
          200,
          await updateReminder(reminderRoute[1] ? decodeURIComponent(reminderRoute[1]) : undefined, payload),
          webOrigin,
        );
      } catch {
        return writeJson(
          response,
          400,
          { error: { code: "INVALID_REMINDER", message: "Invalid local reminder." } },
          webOrigin,
        );
      }
    }
    if (request.method === "POST" && path === "/api/v1/family/selections") {
      if (request.headers.origin && request.headers.origin !== webOrigin)
        return writeJson(
          response,
          403,
          { error: { code: "ORIGIN_NOT_ALLOWED", message: "Mutation origin is not allowed." } },
          webOrigin,
        );
      try {
        let body = "";
        for await (const chunk of request) {
          body += String(chunk);
          if (body.length > 5000) throw new Error("too large");
        }
        return writeJson(response, 200, await updateFamilySelection(JSON.parse(body)), webOrigin);
      } catch {
        return writeJson(
          response,
          400,
          { error: { code: "INVALID_SELECTION", message: "Invalid household selection." } },
          webOrigin,
        );
      }
    }
    if (request.method !== "GET")
      return writeJson(
        response,
        405,
        { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed for this endpoint." } },
        webOrigin,
      );
    const endpoint = endpoints[path];
    if (!endpoint)
      return writeJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found." } }, webOrigin);
    try {
      writeJson(response, 200, await endpoint(), webOrigin);
    } catch (error) {
      console.error("HOMEBASE API request failed", error instanceof Error ? error.message : "unknown error");
      writeJson(
        response,
        503,
        { error: { code: "FOUNDATION_UNAVAILABLE", message: "HOMEBASE data is temporarily unavailable." } },
        webOrigin,
      );
    }
  };
}
