import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./server";

describe("parseServerEnv", () => {
  it("rejects a missing Neon connection string", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("accepts the complete server configuration", () => {
    const value = parseServerEnv({
      DATABASE_URL: "postgresql://owner:secret@example.neon.tech/neondb?sslmode=require",
      BETTER_AUTH_SECRET: "a-secure-test-secret-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
      YGGDRASIL_ASSET_ROOT: "C:\\dev\\yggdrasil-data",
      YGGDRASIL_OWNER_EMAIL: "owner@example.test",
    });
    expect(value.YGGDRASIL_OWNER_EMAIL).toBe("owner@example.test");
  });
});
