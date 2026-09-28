import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryProjectRepository, ProjectHistory } from "@/features/projects/application/project-history";
import { analyzeImportedClip, animationClipFromManifest, attachImportedClip, targetRootFromNames } from "@/features/viewer/imported-clips";
import { createAnimationImportHandler } from "./handler";

const ownerId = "owner-1";
const manifest = { name: "Wave", durationSeconds: 1, tracks: [{ target: "Arm", path: "position", times: [0, 1], values: [0, 0, 0, 1, 0, 0] }] };
const sourceBytes = new TextEncoder().encode(JSON.stringify(manifest));

async function fixture() {
  const history = new ProjectHistory(new InMemoryProjectRepository({ "asset-1": "version-1" }));
  const initial = await history.create({ ownerId, assetId: "asset-1" });
  const files = new Map<string, Uint8Array>();
  const storage = {
    put: async (key: string, bytes: Uint8Array) => { if (files.has(key)) throw new Error("Exists"); files.set(key, bytes); },
    removeTree: async (prefix: string) => { for (const key of files.keys()) if (key.startsWith(`${prefix}/`)) files.delete(key); },
  };
  const clip = animationClipFromManifest(manifest);
  const analysis = analyzeImportedClip(clip, targetRootFromNames(["Arm"]), targetRootFromNames(["Arm"]));
  const attachment = attachImportedClip(analysis, { id: crypto.randomUUID(), sourceFileName: "wave.json", sourceStorageKey: "pending", sourceSha256: "0".repeat(64) });
  const makeHandler = (signedInOwner: string | null = ownerId, saveHistory = history) => createAnimationImportHandler({
    getSession: async () => signedInOwner ? { user: { id: signedInOwner } } : null,
    history: saveHistory,
    getTargetAnalysis: async (owner, assetId, versionId) => owner === ownerId && assetId === "asset-1" && versionId === "version-1" ? { nodeNames: ["Arm"] } : null,
    storage,
  });
  const request = (clip = attachment) => new Request("http://localhost/animation-import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: "wave.json", bytesBase64: Buffer.from(sourceBytes).toString("base64"), clip }) });
  return { history, initial, files, attachment, makeHandler, request };
}

describe("animation import API", () => {
  it("stores the original bytes and a reproducible mapping in the owner's project revision", async () => {
    const { history, initial, files, makeHandler, request } = await fixture();
    const result = await makeHandler()(initial.project.id, request());
    expect(result.status).toBe(200);
    const reloaded = await history.load(ownerId, initial.project.id);
    const attached = reloaded!.project.snapshot.animation.importedClips[0];
    expect(attached.tracks[0]).toMatchObject({ sourceTarget: "Arm", targetNode: "Arm", path: "position", component: null });
    expect(attached.sourceSha256).toBe(createHash("sha256").update(sourceBytes).digest("hex"));
    expect(Buffer.from(files.get(attached.sourceStorageKey)!)).toEqual(Buffer.from(sourceBytes));
    expect(reloaded!.project.revision).toBe(1);
  });

  it("rejects unauthenticated and cross-owner imports before touching storage", async () => {
    const { initial, files, makeHandler, request } = await fixture();
    expect((await makeHandler(null)(initial.project.id, request())).status).toBe(401);
    expect((await makeHandler("owner-2")(initial.project.id, request())).status).toBe(404);
    expect(files.size).toBe(0);
  });

  it("rejects tampered tracks without changing existing clips or revision", async () => {
    const { history, initial, files, attachment, makeHandler, request } = await fixture();
    const existing = await history.save({ ownerId, projectId: initial.project.id, expectedRevision: 0, activeStep: "Animate", snapshot: { ...initial.project.snapshot, animation: { ...initial.project.snapshot.animation, embeddedClips: [{ id: crypto.randomUUID(), sourceIndex: 0, name: "Existing", enabled: true, trimStart: 0, trimEnd: 1, speed: 1, loop: "repeat" }] } } });
    const tampered = { ...attachment, tracks: [{ ...attachment.tracks[0], values: [5, 5, 5, 5, 5, 5] }] };
    expect((await makeHandler()(initial.project.id, request(tampered))).status).toBe(400);
    const reloaded = await history.load(ownerId, initial.project.id);
    expect(reloaded!.project.revision).toBe(existing.project.revision);
    expect(reloaded!.project.snapshot.animation.embeddedClips[0].name).toBe("Existing");
    expect(reloaded!.project.snapshot.animation.importedClips).toEqual([]);
    expect(files.size).toBe(0);
  });

  it("removes staged bytes when a revision conflict prevents attachment", async () => {
    const { history, initial, files, makeHandler, request } = await fixture();
    const staleHistory = { load: history.load.bind(history), save: async () => { throw new Error("Stale project revision"); } } as unknown as ProjectHistory;
    expect((await makeHandler(ownerId, staleHistory)(initial.project.id, request())).status).toBe(409);
    expect(files.size).toBe(0);
    expect((await history.load(ownerId, initial.project.id))!.project.revision).toBe(0);
  });
});
