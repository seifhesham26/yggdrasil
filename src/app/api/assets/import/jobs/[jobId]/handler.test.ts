import { describe, expect, it, vi } from "vitest";
import type { ImportJobRecord } from "@/features/assets/infrastructure/import-job-persistence";
import { createImportJobHandler } from "./handler";

describe("import job control", () => {
  it("shows an owner-scoped review and confirms only a viable staged candidate", async () => {
    const job = { id: "job-1", ownerId: "owner-1", phase: "received", uploadPrefix: "staging/upload-1", files: [], candidates: [] } as unknown as ImportJobRecord;
    const selectVariant = vi.fn(async () => ({ ...job, selectedModelPath: "high/model.gltf" }));
    const reviewJob = vi.fn(async () => ({ candidates: [
      { modelPath: "low/model.gltf", resources: [], missingResources: ["low/missing.bin"], problems: [], resourceInspection: "complete" as const, attributionFiles: [], attribution: "unknown" as const, selected: false },
      { modelPath: "high/model.gltf", resources: ["high/model.bin"], missingResources: [], problems: [], resourceInspection: "complete" as const, attributionFiles: [], attribution: "unknown" as const, selected: false },
    ], attributionFiles: [{ relativePath: "README.md", text: "Terms unclear", truncated: false }] }));
    const handler = createImportJobHandler({
      getSession: vi.fn(async () => ({ user: { id: "owner-1" } })),
      jobs: { get: vi.fn(async () => job), retry: vi.fn(), selectVariant, requestCancel: vi.fn(), markCancelled: vi.fn() },
      removeUpload: vi.fn(), reviewJob,
    });
    const response = await handler.GET(new Request("http://localhost/jobs/job-1?view=review"), "job-1");
    expect(await response.json()).toMatchObject({ candidates: [{ modelPath: "low/model.gltf" }, { modelPath: "high/model.gltf" }] });
    const patch = (selectedModelPath: string) => handler.PATCH(new Request("http://localhost/jobs/job-1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select-variant", selectedModelPath }) }), "job-1");
    expect((await patch("low/model.gltf")).status).toBe(409);
    expect((await patch("other/model.gltf")).status).toBe(409);
    expect((await patch("high/model.gltf")).status).toBe(200);
    expect(selectVariant).toHaveBeenCalledOnce();
    expect(selectVariant).toHaveBeenCalledWith("owner-1", "job-1", "high/model.gltf");
  });

  it("rejects a null JSON body without throwing", async () => {
    const job = { id: "job-1", ownerId: "owner-1", uploadPrefix: "staging/upload-1" } as ImportJobRecord;
    const handler = createImportJobHandler({
      getSession: vi.fn(async () => ({ user: { id: "owner-1" } })),
      jobs: {
        get: vi.fn(async () => job), retry: vi.fn(), selectVariant: vi.fn(),
        requestCancel: vi.fn(), markCancelled: vi.fn(),
      },
      removeUpload: vi.fn(),
    });
    const response = await handler.PATCH(new Request("http://localhost/jobs/job-1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "null" }), "job-1");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_REQUEST" });
  });
});
