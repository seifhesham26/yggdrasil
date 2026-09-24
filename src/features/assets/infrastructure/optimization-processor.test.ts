// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { createGltfFixture } from "@/test/fixtures/create-gltf-fixture";
import { analyzeGltf } from "./gltf-analyzer";
import { optimizedStorageKey, processOptimization } from "./optimization-processor";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { NodeIO } from "@gltf-transform/core";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("processOptimization", () => {
  it.each(["normalize", "remove-unused"] as const)("preserves required material extensions, values, and animation through %s", async (operation) => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-material-")); roots.push(root);
    const storage = new LocalAssetStorage(root); const fixture = createGltfFixture();
    const metadata = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
    metadata.extensionsUsed = ["KHR_materials_unlit", "KHR_materials_clearcoat"];
    metadata.extensionsRequired = ["KHR_materials_unlit"];
    metadata.materials[0].extensions = { KHR_materials_unlit: {}, KHR_materials_clearcoat: { clearcoatFactor: 0.7, clearcoatRoughnessFactor: 0.3 } };
    const input = parseStorageKey("source/triangle.gltf");
    await storage.put(input, new TextEncoder().encode(JSON.stringify(metadata)));
    await storage.put(parseStorageKey("source/triangle.bin"), fixture.binary.bytes);
    const output = await processOptimization(storage, input, operation);
    const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
    const document = await io.readBinary(output.bytes);
    const json = (await io.writeJSON(document)).json;
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(["KHR_materials_unlit", "KHR_materials_clearcoat"]));
    expect(json.extensionsRequired).toContain("KHR_materials_unlit");
    expect(json.materials?.[0]).toMatchObject({ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.3, 0.2, 1] }, extensions: { KHR_materials_unlit: {}, KHR_materials_clearcoat: { clearcoatFactor: 0.7, clearcoatRoughnessFactor: 0.3 } } });
    expect(document.getRoot().listAnimations()[0].listChannels()).toHaveLength(1);
  });

  it.each([false, true])("rejects unknown material extensions before writing (required=%s)", async (required) => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-material-")); roots.push(root);
    const storage = new LocalAssetStorage(root); const fixture = createGltfFixture();
    const metadata = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
    metadata.extensionsUsed = ["VENDOR_material_secret"];
    if (required) metadata.extensionsRequired = metadata.extensionsUsed;
    metadata.materials[0].extensions = { VENDOR_material_secret: { tint: 0.5 } };
    const input = parseStorageKey("source/triangle.gltf");
    await storage.put(input, new TextEncoder().encode(JSON.stringify(metadata)));
    await storage.put(parseStorageKey("source/triangle.bin"), fixture.binary.bytes);
    await expect(processOptimization(storage, input, "normalize")).rejects.toThrow(/fidelity|unsupported/i);
  });

  it("rejects missing material textures instead of dropping them", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-material-")); roots.push(root);
    const storage = new LocalAssetStorage(root); const fixture = createGltfFixture();
    const metadata = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
    metadata.images = [{ uri: "missing.png" }]; metadata.textures = [{ source: 0 }];
    metadata.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
    const input = parseStorageKey("source/triangle.gltf");
    await storage.put(input, new TextEncoder().encode(JSON.stringify(metadata)));
    await storage.put(parseStorageKey("source/triangle.bin"), fixture.binary.bytes);
    await expect(processOptimization(storage, input, "normalize")).rejects.toThrow();
  });
  it("creates a new valid GLB without modifying the source fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-optimize-")); roots.push(root);
    const storage = new LocalAssetStorage(root); const fixture = createGltfFixture();
    const input = parseStorageKey("source/triangle.gltf"); await storage.put(input, fixture.model.bytes); await storage.put(parseStorageKey("source/triangle.bin"), fixture.binary.bytes);
    const before = await storage.read(input);
    const output = await processOptimization(storage, input, "remove-unused");
    const key = optimizedStorageKey("asset-1", "version-1"); await storage.put(key, output.bytes);
    expect(await storage.read(input)).toEqual(before);
    expect((await analyzeGltf(storage, key)).counts.triangles).toBe(1);
  });

  it.each(["compress-geometry", "resize-textures", "lower-detail"] as const)("rejects %s when its encoder is not configured", async (operation) => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-optimize-")); roots.push(root);
    const storage = new LocalAssetStorage(root); const fixture = createGltfFixture(); const input = parseStorageKey("source/triangle.gltf");
    await storage.put(input, fixture.model.bytes); await storage.put(parseStorageKey("source/triangle.bin"), fixture.binary.bytes);
    await expect(processOptimization(storage, input, operation)).rejects.toThrow("Unsupported optimization operation");
  });
});
