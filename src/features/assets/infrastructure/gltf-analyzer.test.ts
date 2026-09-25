// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { createGltfFixture, createMultiClipGltfFixture } from "@/test/fixtures/create-gltf-fixture";
import { analyzeGltf } from "./gltf-analyzer";

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureStorage() {
  const root = await mkdtemp(join(tmpdir(), "yggdrasil-analysis-"));
  tempRoots.push(root);
  const storage = new LocalAssetStorage(root);
  const fixture = createGltfFixture();
  const key = parseStorageKey(fixture.model.relativePath);
  await storage.put(key, fixture.model.bytes);
  await storage.put(parseStorageKey(fixture.binary.relativePath), fixture.binary.bytes);
  return { storage, key };
}

describe("analyzeGltf", () => {
  it("counts and bounds a generated glTF 2.0 triangle and its animation", async () => {
    const { storage, key } = await fixtureStorage();
    const analysis = await analyzeGltf(storage, key);
    expect(analysis.format).toBe("gltf");
    expect(analysis.counts).toMatchObject({
      scenes: 1, nodes: 1, meshes: 1, primitives: 1, vertices: 3,
      triangles: 1, materials: 1, animations: 1,
    });
    expect(analysis.nodeNames).toEqual(["Animated Triangle"]);
    expect(analysis.bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
    expect(analysis.animations).toEqual([{ name: "Rise", durationSeconds: 1, channels: 1, sourceIndex: 0, targets: [{ nodeName: "Animated Triangle", path: "translation" }], usesSkeleton: false, usesMorph: false }]);
  });

  it("keeps multiple clip source indices, durations and targets in glTF order", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-multi-clip-")); tempRoots.push(root);
    const storage = new LocalAssetStorage(root);
    const fixture = createMultiClipGltfFixture();
    const key = parseStorageKey(fixture.model.relativePath);
    await storage.put(key, fixture.model.bytes);
    await storage.put(parseStorageKey(fixture.binary.relativePath), fixture.binary.bytes);
    const analysis = await analyzeGltf(storage, key);
    expect(analysis.animations).toMatchObject([
      { name: "Z Rise", sourceIndex: 0, durationSeconds: 1, targets: [{ nodeName: "Animated Triangle", path: "translation" }] },
      { name: "A Scale", sourceIndex: 1, durationSeconds: 2, targets: [{ nodeName: "Animated Triangle", path: "scale" }] },
    ]);
  });

  it("also analyzes a GLB produced from the generated fixture", async () => {
    const { storage, key } = await fixtureStorage();
    const io = new NodeIO();
    const document = await io.read(storage.processingPath(key));
    const glb = await io.writeBinary(document);
    const glbKey = parseStorageKey("triangle.glb");
    await storage.put(glbKey, glb);
    const analysis = await analyzeGltf(storage, glbKey);
    expect(analysis.format).toBe("glb");
    expect(analysis.counts).toMatchObject({ vertices: 3, triangles: 1, animations: 1 });
  });

  it("rejects an external resource URI that escapes the storage root", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-analysis-"));
    tempRoots.push(root);
    const storage = new LocalAssetStorage(root);
    const fixture = createGltfFixture();
    const json = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
    json.buffers[0].uri = "../../outside.bin";
    const key = parseStorageKey("nested/triangle.gltf");
    await storage.put(key, new TextEncoder().encode(JSON.stringify(json)));
    await expect(analyzeGltf(storage, key)).rejects.toMatchObject({ code: "INVALID_PATH" });
  });

  it("reports a missing referenced texture without changing the source", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-analysis-"));
    tempRoots.push(root);
    const storage = new LocalAssetStorage(root);
    const fixture = createGltfFixture();
    const json = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
    json.images = [{ uri: "missing.png" }];
    json.textures = [{ source: 0 }];
    json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
    const key = parseStorageKey("triangle.gltf");
    await storage.put(key, new TextEncoder().encode(JSON.stringify(json)));
    await storage.put(parseStorageKey("triangle.bin"), fixture.binary.bytes);
    const analysis = await analyzeGltf(storage, key);
    expect(analysis.counts.textures).toBe(1);
    expect(analysis.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_TEXTURE" })]));
  });

  it("flags unsupported required extensions", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-analysis-"));
    tempRoots.push(root);
    const storage = new LocalAssetStorage(root);
    const fixture = createGltfFixture();
    const json = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
    json.extensionsUsed = ["VENDOR_test_extension"];
    json.extensionsRequired = ["VENDOR_test_extension"];
    const key = parseStorageKey("triangle.gltf");
    await storage.put(key, new TextEncoder().encode(JSON.stringify(json)));
    await storage.put(parseStorageKey("triangle.bin"), fixture.binary.bytes);
    const analysis = await analyzeGltf(storage, key);
    expect(analysis.extensionsUsed).toEqual(["VENDOR_test_extension"]);
    expect(analysis.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_REQUIRED_EXTENSION" })]));
  });

  const privateDir = process.env.YGGDRASIL_PRIVATE_FIXTURE_DIR;
  it.skipIf(!privateDir)("analyzes the private Mega Wyvern without copying it", async () => {
    const storage = new LocalAssetStorage(privateDir!);
    const analysis = await analyzeGltf(storage, parseStorageKey("f8caf90ad5da4017b0dddfe880cf37cc_Textured.gltf"));
    expect(analysis.counts).toMatchObject({ nodes: 78, meshes: 1, materials: 1, skins: 1, cameras: 0, animations: 11 });
  });
});
