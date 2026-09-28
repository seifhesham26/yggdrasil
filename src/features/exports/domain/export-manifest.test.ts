import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultProjectSnapshot } from "@/features/projects/domain/project-state";
import type { Project } from "@/features/projects/application/project-history";
import type { StoredAssetFile } from "@/features/assets/infrastructure/asset-repository";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { buildExportManifest, ExportManifestSchema, safePortablePath, type VersionFile } from "./export-manifest";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "yggdrasil-export-manifest-")); roots.push(root);
  const storage = new LocalAssetStorage(root);
  const modelBytes = new TextEncoder().encode('{"asset":{"version":"2.0"}}');
  const licenseBytes = new TextEncoder().encode("Copyright 2026 Model Author. CC BY 4.0.");
  await storage.put(parseStorageKey("assets/source/model.gltf"), modelBytes);
  await storage.put(parseStorageKey("assets/source/LICENSE.txt"), licenseBytes);
  const version: VersionFile = { id: crypto.randomUUID(), storageKey: "assets/source/model.gltf", relativePath: "model.gltf", byteSize: modelBytes.length, sha256: hash(modelBytes), mimeType: "model/gltf+json" };
  const sourceFiles: StoredAssetFile[] = [
    { ...version, role: "model" },
    { relativePath: "LICENSE.txt", storageKey: "assets/source/LICENSE.txt", byteSize: licenseBytes.length, sha256: hash(licenseBytes), mimeType: "text/plain", role: "attribution" },
  ];
  const project: Project = { id: crypto.randomUUID(), ownerId: "owner", assetId: crypto.randomUUID(), assetVersionId: version.id, name: "Dragon", revision: 3, currentRevisionId: crypto.randomUUID(), activeStep: "Export", snapshot: defaultProjectSnapshot(), createdAt: new Date(), updatedAt: new Date() };
  return { storage, project, version, sourceFiles };
}

describe("export manifest", () => {
  it("round-trips a frozen revision with portable file paths and attribution", async () => {
    const { storage, project, version, sourceFiles } = await fixture();
    const { manifest, files } = await buildExportManifest(project, version, sourceFiles, storage, new Date("2026-09-28T00:00:00.000Z"));
    expect(manifest.projectRevision).toBe(3);
    expect(manifest.projectRevisionId).toBe(project.currentRevisionId);
    expect(manifest.modelPath).toBe("assets/source/model.gltf");
    expect(manifest.attribution[0].text).toContain("CC BY 4.0");
    expect(files).toHaveLength(2);
    expect(ExportManifestSchema.parse(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
    expect(JSON.stringify(manifest)).not.toContain("assets/source/LICENSE.txt\" ,\"storageKey");
    expect(JSON.stringify(manifest)).not.toContain("storageKey");
    expect(JSON.stringify(manifest)).not.toMatch(/postgres:\/\/|BETTER_AUTH_SECRET|[a-z]:\\/i);
  });

  it("rejects missing or changed files, unsupported actions, secrets, and unsafe paths", async () => {
    const { storage, project, version, sourceFiles } = await fixture();
    await expect(buildExportManifest(project, { ...version, sha256: "0".repeat(64) }, sourceFiles, storage)).rejects.toThrow(/changed/);
    await expect(buildExportManifest(project, version, [...sourceFiles, { ...sourceFiles[1], relativePath: "missing.txt", storageKey: "assets/source/missing.txt" }], storage)).rejects.toThrow();
    project.snapshot.interactions = [{ id: "i", targetNodeId: "face", trigger: "click", action: { type: "play-clip", clipId: "missing" } }];
    await expect(buildExportManifest(project, version, sourceFiles, storage)).rejects.toThrow(/unsupported/);
    project.snapshot.interactions = [];
    expect(safePortablePath("../private/model.glb")).toBeNull();
    expect(safePortablePath("C:\\private\\model.glb")).toBeNull();
    expect(safePortablePath("assets/source/CON.gltf")).toBeNull();
    await expect(buildExportManifest(project, { ...version, relativePath: "../private/model.gltf" }, sourceFiles, storage)).rejects.toThrow();
    project.snapshot.export.criticalAssetIds = ["assets/source/missing.bin"];
    await expect(buildExportManifest(project, version, sourceFiles, storage)).rejects.toThrow(/Critical asset/);
  });

  it("checks private imported clip bytes but excludes their storage keys from public config", async () => {
    const { storage, project, version, sourceFiles } = await fixture();
    const clipBytes = new TextEncoder().encode("private source");
    await storage.put(parseStorageKey("assets/clip/private.glb"), clipBytes);
    project.snapshot.animation.importedClips = [{ id: crypto.randomUUID(), name: "Wave", sourceFileName: "wave.glb", sourceClipIndex: 0, sourceStorageKey: "assets/clip/private.glb", sourceSha256: hash(clipBytes), durationSeconds: 1, trimStart: 0, trimEnd: 1, speed: 1, loop: "once", tracks: [], mapping: [], enabled: true }];
    const result = await buildExportManifest(project, version, sourceFiles, storage);
    expect(JSON.stringify(result.manifest)).not.toContain("assets/clip/private.glb");
    expect(result.manifest.config.animation.importedClips[0].sourceSha256).toBe(hash(clipBytes));
    project.snapshot.animation.importedClips[0].sourceSha256 = "0".repeat(64);
    await expect(buildExportManifest(project, version, sourceFiles, storage)).rejects.toThrow(/missing or changed/);
  });
});
