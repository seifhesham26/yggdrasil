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

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("processOptimization", () => {
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

  it("rejects operations whose encoders are not configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-optimize-")); roots.push(root);
    const storage = new LocalAssetStorage(root); const fixture = createGltfFixture(); const input = parseStorageKey("source/triangle.gltf");
    await storage.put(input, fixture.model.bytes); await storage.put(parseStorageKey("source/triangle.bin"), fixture.binary.bytes);
    await expect(processOptimization(storage, input, "compress-geometry")).rejects.toThrow("Unsupported optimization operation");
  });
});
