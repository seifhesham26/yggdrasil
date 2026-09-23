// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AssetImportError } from "@/features/assets/domain/errors";
import { createImportHandler } from "./handler";

function request(files: Array<{ name: string; bytes: Uint8Array }>, paths?: string[]) {
  const form = new FormData();
  files.forEach((file) => form.append("file", new File([file.bytes as BlobPart], file.name)));
  if (paths) form.set("relativePath", JSON.stringify(paths));
  return new Request("http://localhost/api/assets/import", { method: "POST", body: form });
}

const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);

describe("POST /api/assets/import", () => {
  it("returns 401 without a session", async () => {
    const importAsset = vi.fn();
    const handler = createImportHandler({ getSession: async () => null, importAsset });
    const response = await handler(request([{ name: "hero.glb", bytes: glb }]));
    expect(response.status).toBe(401);
    expect(importAsset).not.toHaveBeenCalled();
  });

  it("returns NO_FILES for empty multipart input", async () => {
    const handler = createImportHandler({ getSession: async () => ({ user: { id: "owner" } }), importAsset: vi.fn() });
    const response = await handler(request([]));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "NO_FILES" });
  });

  it("rejects an oversized request before parsing its body", async () => {
    const importAsset = vi.fn();
    const handler = createImportHandler({ getSession: async () => ({ user: { id: "owner" } }), importAsset });
    const upload = request([{ name: "hero.glb", bytes: glb }]);
    upload.headers.set("content-length", String(1024 ** 3 + 1));
    const response = await handler(upload);
    expect(response.status).toBe(413);
    expect(importAsset).not.toHaveBeenCalled();
  });

  it("preserves relative paths and bytes from the multipart manifest", async () => {
    const importAsset = vi.fn(async () => ({ assetId: "asset-1", sourceId: "source-1", analysis: {} as never }));
    const handler = createImportHandler({ getSession: async () => ({ user: { id: "owner" } }), importAsset });
    const response = await handler(request([{ name: "hero.glb", bytes: glb }], ["nested/hero.glb"]));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ assetId: "asset-1", status: "ready" });
    expect(importAsset).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "owner",
      entries: [{ relativePath: "nested/hero.glb", bytes: glb }],
    }));
  });

  it("returns 422 and candidates for ambiguous models", async () => {
    const importAsset = vi.fn(async () => { throw new AssetImportError("AMBIGUOUS_PRIMARY_MODEL", "Pick one", ["a.glb", "b.glb"]); });
    const handler = createImportHandler({ getSession: async () => ({ user: { id: "owner" } }), importAsset });
    const response = await handler(request([{ name: "a.glb", bytes: glb }]));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "AMBIGUOUS_PRIMARY_MODEL", candidates: ["a.glb", "b.glb"] });
  });

  it("returns the named missing dependency for actionable recovery", async () => {
    const handler = createImportHandler({ getSession: async () => ({ user: { id: "owner" } }), importAsset: vi.fn(async () => { throw new AssetImportError("MISSING_DEPENDENCY", "OBJ model references missing MTL file: model.mtl"); }) });
    const response = await handler(request([{ name: "model.obj", bytes: new TextEncoder().encode("v 0 0 0\n") }]));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "MISSING_DEPENDENCY", message: "OBJ model references missing MTL file: model.mtl" });
  });
});
