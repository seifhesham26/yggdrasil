// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { spoolImportUpload } from "@/features/assets/infrastructure/upload-spool";
import { createImportJobUploadHandler } from "./handler";

function request() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3]) as BlobPart], "model.glb"));
  return new Request("http://localhost/api/assets/import/jobs", { method: "POST", body: form });
}

describe("POST /api/assets/import/jobs", () => {
  it("persists only protected relative storage keys and retains the spool for processing", async () => {
    const root = await mkdtemp(join(tmpdir(), "yggdrasil-job-upload-test-"));
    try {
      const create = vi.fn(async (input: { files: Array<{ storageKey: string }> }) => ({ id: "job-1", phase: "received", ...input }));
      const handler = createImportJobUploadHandler({
        getSession: async () => ({ user: { id: "owner" } }),
        spoolUpload: (input) => spoolImportUpload(input, root),
        createJob: create,
        storageRoot: root,
      });
      const response = await handler(request());
      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ jobId: "job-1", phase: "received" });
      expect(create.mock.calls[0][0].files[0].storageKey).toMatch(/^staging\/upload-[^/]+\/0\.part$/);
      expect((await readdir(join(root, "staging"))).length).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
