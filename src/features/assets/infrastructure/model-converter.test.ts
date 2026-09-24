// @vitest-environment node
import { readFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { buildImportManifest } from "./import-manifest";
import { convertModelToGlb } from "./model-converter";

describe("convertModelToGlb", () => {
  it("imports the redistributable OBJ package and preserves its material dependencies", async () => {
    const paths = ["painted-panel.obj", "painted-panel.mtl", "checker.png"];
    const entries = await Promise.all(paths.map(async (relativePath) => ({
      relativePath,
      bytes: new Uint8Array(await readFile(new URL(`../../../test/fixtures/phase-1/${relativePath}`, import.meta.url))),
    })));
    const manifest = await buildImportManifest(entries);
    const originals = entries.map((entry) => new Uint8Array(entry.bytes));
    const result = await convertModelToGlb({ format: "obj", ...manifest.primaryModel });
    const document = await new NodeIO().readBinary(result.bytes);

    expect(manifest.dependencies.map((file) => file.relativePath)).toEqual(["painted-panel.mtl", "checker.png"]);
    expect(document.getRoot().listMeshes()).toHaveLength(1);
    expect(document.getRoot().listMeshes()[0].listPrimitives()).toHaveLength(1);
    expect(document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("POSITION")?.getCount()).toBe(6);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "OBJ_MATERIALS_NOT_CONVERTED" })]));
    expect(entries.map((entry) => entry.bytes)).toEqual(originals);
  });

  it("imports the redistributable FBX cube with geometry and explicit fidelity limits", async () => {
    const bytes = new Uint8Array(await readFile(new URL("../../../test/fixtures/phase-1/cube.fbx", import.meta.url)));
    const original = new Uint8Array(bytes);
    const manifest = await buildImportManifest([{ relativePath: "cube.fbx", bytes }]);
    const result = await convertModelToGlb({ format: "fbx", ...manifest.primaryModel });
    const document = await new NodeIO().readBinary(result.bytes);

    expect(document.getRoot().listMeshes()).toHaveLength(1);
    expect(document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("POSITION")?.getCount()).toBe(36);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "FBX_FIDELITY_LIMITS" })]));
    expect(bytes).toEqual(original);
  });

  it("converts a legal OBJ into a GLB without changing its source bytes", async () => {
    const source = new TextEncoder().encode("o Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    const result = await convertModelToGlb({ format: "obj", bytes: source, relativePath: "model.obj" });
    expect(new TextDecoder().decode(result.bytes.subarray(0, 4))).toBe("glTF");
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "OBJ_MATERIALS_NOT_CONVERTED" })]));
    expect(source).toEqual(new TextEncoder().encode("o Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"));
  });

});
