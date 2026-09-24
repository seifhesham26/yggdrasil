// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { spoolImportUpload } from "./upload-spool";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function root() {
  const path = await mkdtemp(join(tmpdir(), "yggdrasil-spool-test-"));
  roots.push(path);
  return path;
}

function upload(files: Array<{ name: string; bytes: Uint8Array }>, paths?: string[]) {
  const form = new FormData();
  files.forEach((file) => form.append("file", new File([file.bytes as BlobPart], file.name)));
  if (paths) form.set("relativePath", JSON.stringify(paths));
  return new Request("http://localhost/api/assets/import", { method: "POST", body: form });
}

describe("spoolImportUpload", () => {
  it("streams files to private temporary paths and preserves manifest order", async () => {
    const storageRoot = await root();
    const input = new Uint8Array([0, 1, 2, 3, 255]);
    const result = await spoolImportUpload(upload([{ name: "model.glb", bytes: input }], ["folder/model.glb"]), storageRoot);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ relativePath: "folder/model.glb", byteSize: input.length });
    expect(await readFile(result.entries[0].path)).toEqual(Buffer.from(input));
    expect(result.entries[0].path).toMatch(/yggdrasil-spool-test-/);
    await result.cleanup();
    expect(await readdir(join(storageRoot, "staging"))).toEqual([]);
  });

  it("enforces actual streamed bytes when Content-Length understates the body", async () => {
    const storageRoot = await root();
    const request = upload([{ name: "big.bin", bytes: new Uint8Array(128) }]);
    request.headers.set("content-length", "1");
    await expect(spoolImportUpload(request, storageRoot, { maxUploadBytes: 64 })).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
    expect(await readdir(join(storageRoot, "staging"))).toEqual([]);
  });

  it("rejects a file limit and removes partial files", async () => {
    const storageRoot = await root();
    await expect(spoolImportUpload(upload([{ name: "big.bin", bytes: new Uint8Array(128) }]), storageRoot, { maxFileBytes: 64 })).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
    expect(await readdir(join(storageRoot, "staging"))).toEqual([]);
  });

  it("rejects a path manifest with the wrong number of entries", async () => {
    const storageRoot = await root();
    await expect(spoolImportUpload(upload([{ name: "one.glb", bytes: new Uint8Array([1]) }], ["one.glb", "two.glb"]), storageRoot)).rejects.toMatchObject({ code: "INVALID_MANIFEST" });
    expect(await readdir(join(storageRoot, "staging"))).toEqual([]);
  });

  it("removes partial files when the request stream fails", async () => {
    const storageRoot = await root();
    const boundary = "broken-upload";
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="model.glb"\r\nContent-Type: application/octet-stream\r\n\r\nglTF`));
        controller.error(new Error("connection lost"));
      },
    });
    const request = new Request("http://localhost/api/assets/import", {
      method: "POST", headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body, duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(spoolImportUpload(request, storageRoot)).rejects.toMatchObject({ code: "INVALID_MULTIPART" });
    expect(await readdir(join(storageRoot, "staging"))).toEqual([]);
  });
});
