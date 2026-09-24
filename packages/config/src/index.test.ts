import { describe, expect, it } from "vitest";
import { apiEnvironmentSchema } from "./index.js";

describe("API environment", () => {
  it("starts safely without provider credentials", () => {
    expect(apiEnvironmentSchema.parse({})).toMatchObject({ API_PORT: 4000, HOMEBASE_ENV: "development" });
  });
  it("rejects invalid origins", () => {
    expect(apiEnvironmentSchema.safeParse({ WEB_ORIGIN: "not-a-url" }).success).toBe(false);
  });
  it("treats empty optional Proxmox values as disabled", () => {
    const value = apiEnvironmentSchema.parse({
      PROXMOX_BASE_URL: "",
      PROXMOX_TOKEN_ID: "",
      PROXMOX_TOKEN_SECRET: "",
    });
    expect(value.PROXMOX_BASE_URL).toBeUndefined();
    expect(value.PROXMOX_TOKEN_ID).toBeUndefined();
    expect(value.PROXMOX_TOKEN_SECRET).toBeUndefined();
  });
});
