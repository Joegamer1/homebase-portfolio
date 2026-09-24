import { describe, expect, it } from "vitest";
import {
  attentionResponseSchema,
  healthResponseSchema,
  homeResponseSchema,
  integrationsResponseSchema,
  proxmoxResponseSchema,
} from "@homebase/api-contracts";
import { getAttention, getHealth, getHome, getIntegrations } from "./application.js";
import { getProxmox } from "./proxmox.js";

describe("v1 application responses", () => {
  it("validates representative endpoint payloads", async () => {
    expect(healthResponseSchema.safeParse(await getHealth()).success).toBe(true);
    expect(homeResponseSchema.safeParse(await getHome()).success).toBe(true);
    expect(attentionResponseSchema.safeParse(await getAttention()).success).toBe(true);
    expect(integrationsResponseSchema.safeParse(await getIntegrations()).success).toBe(true);
    expect(proxmoxResponseSchema.safeParse(await getProxmox()).success).toBe(true);
  });
  it("returns ranked attention through the home contract", async () => {
    const response = await getHome();
    const scores = response.data.attention.map((item) => item.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(response.data.mode).toBe("live");
    expect(
      response.data.attention.some(
        (item) => item.source.startsWith("Mock") && ["lab", "career", "security"].includes(item.domain),
      ),
    ).toBe(false);
    expect(response.data.jobs).toEqual([]);
    expect(response.data.today).toEqual([]);
    expect(response.data.focus).toEqual([]);
    expect(response.data.changes).toEqual([]);
    expect(response.data.games).toEqual([]);
    expect(response.data.family).toEqual([]);
    expect(response.data.attention).toEqual([]);
    expect(response.data.integrations.filter((item) => item.key === "proxmox")).toHaveLength(1);
    expect(response.data.integrations.some((item) => item.health.stale)).toBe(true);
  });
});
