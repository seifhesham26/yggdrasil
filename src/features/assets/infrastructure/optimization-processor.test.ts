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
import { EXTMeshoptCompression, EXTTextureAVIF, EXTTextureWebP, KHRONOS_EXTENSIONS, KHRMeshQuantization } from "@gltf-transform/extensions";
import { Document, NodeIO } from "@gltf-transform/core";
import sharp from "sharp";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("processOptimization", () => {
  async function putIndexedModel(storage: LocalAssetStorage, key = parseStorageKey("source/indexed.glb")) {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document.createAccessor("positions").setType("VEC3").setArray(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 1, 1, 0, 1, 0, 1, 1,
    ])).setBuffer(buffer);
    const indices = document.createAccessor("indices").setType("SCALAR").setArray(new Uint16Array([
      0, 1, 2, 3, 4, 5,
    ])).setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", positions).setIndices(indices);
    const mesh = document.createMesh("Indexed mesh").addPrimitive(primitive);
    const node = document.createNode("Indexed node").setMesh(mesh);
    document.createScene("Scene").addChild(node);
    await storage.put(key, await new NodeIO().writeBinary(document));
    return key;
  }

  async function putTexturedModel(storage: LocalAssetStorage) {
    const fixture = createGltfFixture();
    const image = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 220, g: 40, b: 40, alpha: 1 } } }).png().toBuffer();
    const metadata = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
    metadata.images = [{ uri: `data:image/png;base64,${image.toString("base64")}` }];
    metadata.textures = [{ source: 0 }];
    metadata.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
    const input = parseStorageKey("source/textured.gltf");
    await storage.put(input, new TextEncoder().encode(JSON.stringify(metadata)));
    await storage.put(parseStorageKey("source/triangle.bin"), fixture.binary.bytes);
    return input;
  }

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

  it("resizes and converts textures, then reopens the output", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-texture-")); roots.push(root);
    const storage = new LocalAssetStorage(root);
    const input = await putTexturedModel(storage);
    const output = await processOptimization(storage, input, "resize-textures", { keepExtras: true, maxTextureSize: 1, targetFormat: "png" });
    const document = await new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTTextureAVIF, EXTTextureWebP]).readBinary(output.bytes);
    const texture = document.getRoot().listTextures()[0];
    expect(texture.getMimeType()).toBe("image/png");
    expect(texture.getImage()?.byteLength).toBeGreaterThan(0);
    expect((await analyzeGltf(storage, await (async () => { const key = parseStorageKey("source/resized.glb"); await storage.put(key, output.bytes); return key; })())).counts.textures).toBe(1);
  });

  it("compresses indexed geometry with meshopt and preserves a valid scene", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-meshopt-")); roots.push(root);
    const storage = new LocalAssetStorage(root);
    const input = await putIndexedModel(storage);
    const output = await processOptimization(storage, input, "compress-geometry", { keepExtras: true, meshoptLevel: "medium" });
    const { MeshoptDecoder } = await import("meshoptimizer");
    await MeshoptDecoder.ready;
    const document = await new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).readBinary(output.bytes);
    expect(document.getRoot().listScenes()).toHaveLength(1);
    expect(document.getRoot().listExtensionsUsed().map((extension) => extension.extensionName)).toContain("EXT_meshopt_compression");
  });

  it("creates a lower-detail variant with fewer or equal triangles", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-simplify-")); roots.push(root);
    const storage = new LocalAssetStorage(root);
    const input = await putIndexedModel(storage);
    const before = await analyzeGltf(storage, input);
    const output = await processOptimization(storage, input, "lower-detail", { keepExtras: true, detailRatio: 0.5 });
    const key = parseStorageKey("source/lower-detail.glb");
    await storage.put(key, output.bytes);
    const after = await analyzeGltf(storage, key);
    expect(after.counts.triangles).toBeLessThanOrEqual(before.counts.triangles);
    expect(after.counts.triangles).toBeGreaterThan(0);
  });

  it.each([
    ["resize-textures", { keepExtras: true, maxTextureSize: 0 }],
    ["lower-detail", { keepExtras: true, detailRatio: 1.1 }],
  ] as const)("rejects invalid settings for %s", async (operation, settings) => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-optimize-")); roots.push(root);
    const storage = new LocalAssetStorage(root); const fixture = createGltfFixture(); const input = parseStorageKey("source/triangle.gltf");
    await storage.put(input, fixture.model.bytes); await storage.put(parseStorageKey("source/triangle.bin"), fixture.binary.bytes);
    await expect(processOptimization(storage, input, operation, settings)).rejects.toThrow(/invalid|positive|between/i);
  });

  it("rejects an unknown operation before reading source bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-optimize-")); roots.push(root);
    const storage = new LocalAssetStorage(root);
    await expect(processOptimization(storage, parseStorageKey("source/missing.gltf"), "unknown-operation" as never)).rejects.toThrow("Unsupported optimization operation");
  });
});
