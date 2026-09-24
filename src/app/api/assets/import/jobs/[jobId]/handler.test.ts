import { describe, expect, it, vi } from "vitest";
import type { ImportJobRecord } from "@/features/assets/infrastructure/import-job-persistence";
import { createImportJobHandler } from "./handler";

describe("import job control", () => {
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
