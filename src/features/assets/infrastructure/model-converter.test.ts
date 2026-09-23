// @vitest-environment node
import { describe, expect, it } from "vitest";
import { convertModelToGlb } from "./model-converter";

describe("convertModelToGlb", () => {
  it("converts a legal OBJ into a GLB without changing its source bytes", async () => {
    const source = new TextEncoder().encode("o Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    const result = await convertModelToGlb({ format: "obj", bytes: source, relativePath: "model.obj" });
    expect(new TextDecoder().decode(result.bytes.subarray(0, 4))).toBe("glTF");
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "OBJ_MATERIALS_NOT_CONVERTED" })]));
    expect(source).toEqual(new TextEncoder().encode("o Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"));
  });
});
