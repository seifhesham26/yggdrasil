import { describe, expect, it } from "vitest";
import { defaultProjectSnapshot, parseProjectSnapshot } from "./project-state";

describe("project state", () => {
  it("migrates a legacy empty configuration into the current typed snapshot", () => {
    expect(parseProjectSnapshot({})).toEqual(defaultProjectSnapshot());
  });

  it("rejects executable interaction payloads", () => {
    expect(() => parseProjectSnapshot({ interactions: [{ id: "i1", targetNodeId: "mesh-1", trigger: "click", action: { type: "toggle-visibility", script: "alert(1)" } }] })).toThrow(/script/i);
  });

  it("does not relabel unsupported future snapshots as the current schema", () => {
    expect(() => parseProjectSnapshot({ schemaVersion: 2 })).toThrow();
  });
});
