import { describe, expect, it } from "vitest";
import { parseStorageKey } from "./storage-key";

describe("parseStorageKey", () => {
  it("accepts a normalized internal key", () => {
    expect(parseStorageKey("assets/550e8400-e29b-41d4-a716-446655440000/source/model.glb"))
      .toBe("assets/550e8400-e29b-41d4-a716-446655440000/source/model.glb");
  });

  it.each([
    "../secret", "assets/../../secret", "/absolute/file", "C:\\secret",
    "assets\\mixed", "assets//empty", "assets/./dot", "assets/trailing/", "",
    "assets/\0file", "assets/%2e%2e/file",
  ])("rejects unsafe key %s", (value) => {
    expect(() => parseStorageKey(value)).toThrow(/storage key/i);
  });
});
