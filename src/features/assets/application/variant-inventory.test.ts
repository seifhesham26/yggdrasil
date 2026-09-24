// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inventoryVariants } from "./variant-inventory";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("inventoryVariants", () => {
  it("keeps each model candidate with its referenced resources and attribution state", async () => {
    const variants = await inventoryVariants([
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
    expect((await inventoryVariants([
      { relativePath: "hero/low.gltf", bytes: bytes('{"asset":{"version":"2.0"}}') },
      { relativePath: "hero/high.obj", bytes: bytes("v 0 0 0\n") },
    ], "hero/high.obj")).find((variant) => variant.selected)?.model.relativePath).toBe("hero/high.obj");
  });

  it("labels missing attribution as unknown", async () => {
    expect((await inventoryVariants([{ relativePath: "model.obj", bytes: bytes("v 0 0 0\n") }]))[0].attribution).toBe("unknown");
  });

  it("shows nested OBJ material textures and missing resources for each candidate", async () => {
    const variants = await inventoryVariants([
      { relativePath: "low/model.obj", bytes: bytes("mtllib model.mtl\nv 0 0 0\n") },
      { relativePath: "low/model.mtl", bytes: bytes("newmtl paint\nmap_Kd ../shared/color.png\n") },
      { relativePath: "shared/color.png", bytes: new Uint8Array([1]) },
      { relativePath: "high/model.gltf", bytes: bytes('{"asset":{"version":"2.0"},"buffers":[{"uri":"missing.bin"}]}') },
      { relativePath: "README.md", bytes: bytes("A model collection") },
    ]);
    expect(variants[0].resources.map((file) => file.relativePath)).toEqual(["low/model.mtl", "shared/color.png"]);
    expect(variants[0].missingResources).toEqual([]);
    expect(variants[1].missingResources).toEqual(["high/missing.bin"]);
    expect(variants.every((variant) => variant.attribution === "unknown")).toBe(true);
    expect(variants[0].attributionFiles.map((file) => file.relativePath)).toEqual(["README.md"]);
  });

  it("does not infer a license from conflicting credit files", async () => {
    const variants = await inventoryVariants([
      { relativePath: "model.glb", bytes: new Uint8Array([1]) },
      { relativePath: "LICENSE.txt", bytes: bytes("Terms A") },
      { relativePath: "CREDITS.txt", bytes: bytes("Terms B") },
    ]);
    expect(variants[0].attribution).toBe("unknown");
  });

  it("flags references that try to escape the source package", async () => {
    const variants = await inventoryVariants([
      { relativePath: "model.gltf", bytes: bytes('{"asset":{"version":"2.0"},"buffers":[{"uri":"../outside.bin"}]}') },
      { relativePath: "outside.bin", bytes: bytes("not a valid sibling") },
    ]);
    expect(variants[0].resources).toEqual([]);
    expect(variants[0].missingResources).toEqual(["Unsafe reference: ../outside.bin"]);
  });

  it("does not assign one variant's license file to its sibling", async () => {
    const variants = await inventoryVariants([
      { relativePath: "low/model.obj", bytes: bytes("v 0 0 0\n") },
      { relativePath: "high/model.obj", bytes: bytes("v 0 0 0\n") },
      { relativePath: "low/LICENSE.txt", bytes: bytes("CC0") },
    ]);
    expect(variants[0].attributionFiles.map((file) => file.relativePath)).toEqual(["low/LICENSE.txt"]);
    expect(variants[0].attribution).toBe("present");
    expect(variants[1].attributionFiles).toEqual([]);
    expect(variants[1].attribution).toBe("unknown");
  });
});
