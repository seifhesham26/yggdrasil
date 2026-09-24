// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inventoryVariants } from "./variant-inventory";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("inventoryVariants", () => {
  it("keeps each model candidate with its referenced resources and attribution state", () => {
    const variants = inventoryVariants([
      { relativePath: "hero/low.gltf", bytes: bytes('{"asset":{"version":"2.0"},"buffers":[{"uri":"low.bin"}]}') },
      { relativePath: "hero/low.bin", bytes: new Uint8Array([1]) },
      { relativePath: "hero/high.obj", bytes: bytes("mtllib high.mtl\nv 0 0 0\n") },
      { relativePath: "hero/high.mtl", bytes: bytes("newmtl high\n") },
      { relativePath: "hero/LICENSE.txt", bytes: bytes("Attribution") },
    ]);
    expect(variants).toHaveLength(2);
    expect(variants[0].resources.map((file) => file.relativePath)).toEqual(["hero/low.bin"]);
    expect(variants[1].resources.map((file) => file.relativePath)).toEqual(["hero/high.mtl"]);
    expect(variants.every((variant) => variant.attribution === "present")).toBe(true);
    expect(inventoryVariants([
      { relativePath: "hero/low.gltf", bytes: bytes('{"asset":{"version":"2.0"}}') },
      { relativePath: "hero/high.obj", bytes: bytes("v 0 0 0\n") },
    ], "hero/high.obj").find((variant) => variant.selected)?.model.relativePath).toBe("hero/high.obj");
  });

  it("labels missing attribution as unknown", () => {
    expect(inventoryVariants([{ relativePath: "model.obj", bytes: bytes("v 0 0 0\n") }])[0].attribution).toBe("unknown");
  });
});
