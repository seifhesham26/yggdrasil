import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "./connection-url";

describe("normalizeDatabaseUrl", () => {
  it.each(["prefer", "require", "verify-ca"])("preserves current TLS verification for %s", (mode) => {
    const url = normalizeDatabaseUrl(`postgresql://owner:secret@example.test/db?sslmode=${mode}&application_name=yggdrasil`);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("sslmode")).toBe("verify-full");
    expect(parsed.searchParams.get("application_name")).toBe("yggdrasil");
  });

  it("leaves explicit libpq compatibility and local connections unchanged", () => {
    const compatibility = "postgresql://owner:secret@example.test/db?uselibpqcompat=true&sslmode=require";
    const local = "postgresql://localhost/yggdrasil";
    expect(normalizeDatabaseUrl(compatibility)).toBe(compatibility);
    expect(normalizeDatabaseUrl(local)).toBe(local);
    expect(normalizeDatabaseUrl("")).toBe("");
  });
});
