import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalAssetStorage } from "./local-storage";
import { parseStorageKey, type StorageKey } from "./storage-key";

describe("LocalAssetStorage", () => {
  let root: string;
  let storage: LocalAssetStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "yggdrasil-storage-"));
    storage = new LocalAssetStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores and reads identical bytes beneath the configured root", async () => {
    const key = parseStorageKey("assets/a/source/model.glb");
    const bytes = new Uint8Array([1, 2, 3, 255]);
    await storage.put(key, bytes);
    expect(await storage.exists(key)).toBe(true);
    expect(await storage.read(key)).toEqual(bytes);
    expect(await readFile(join(root, "assets", "a", "source", "model.glb")))
      .toEqual(Buffer.from(bytes));
    await expect(storage.put(key, new Uint8Array([9]))).rejects.toThrow();
    expect(await storage.read(key)).toEqual(bytes);
  });

  it("copies a spooled source without overwriting an existing destination", async () => {
    const source = join(root, "input.part");
    const original = Buffer.from([0, 1, 2, 255]);
    await writeFile(source, original);
    const key = parseStorageKey("staging/import-a/model.glb");
    await storage.putFile(key, source);
    expect(await storage.read(key)).toEqual(new Uint8Array(original));
    await expect(storage.putFile(key, source)).rejects.toThrow();
    expect(await readFile(source)).toEqual(original);
  });

  it("commits a staged tree and removes abandoned staging trees", async () => {
    const staged = parseStorageKey("staging/import-a");
    const final = parseStorageKey("assets/asset-a");
    await storage.put(parseStorageKey("staging/import-a/source/model.glb"), new Uint8Array([7]));
    await storage.commitTree(staged, final);
    expect(await storage.exists(parseStorageKey("assets/asset-a/source/model.glb"))).toBe(true);
    expect(await storage.exists(parseStorageKey("staging/import-a/source/model.glb"))).toBe(false);

    await storage.put(parseStorageKey("staging/import-b/source/model.glb"), new Uint8Array([8]));
    await storage.removeTree(parseStorageKey("staging/import-b"));
    expect(await storage.exists(parseStorageKey("staging/import-b/source/model.glb"))).toBe(false);
  });

  it("returns a contained processing path", () => {
    expect(storage.processingPath(parseStorageKey("assets/a/source/model.glb")))
      .toBe(join(root, "assets", "a", "source", "model.glb"));
  });

  it("rejects forged unvalidated keys for every operation", async () => {
    const forged = "../outside" as StorageKey;
    await expect(storage.put(forged, new Uint8Array([1]))).rejects.toThrow(/storage key/i);
    await expect(storage.read(forged)).rejects.toThrow(/storage key/i);
    await expect(storage.exists(forged)).rejects.toThrow(/storage key/i);
    await expect(storage.removeTree(forged)).rejects.toThrow(/storage key/i);
    await expect(storage.commitTree(forged, parseStorageKey("assets/a")))
      .rejects.toThrow(/storage key/i);
    expect(() => storage.processingPath(forged)).toThrow(/storage key/i);
  });
});
