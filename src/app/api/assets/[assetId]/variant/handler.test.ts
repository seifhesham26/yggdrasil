import { describe, expect, it, vi } from "vitest";
import { createVariantSwitchHandler } from "./handler";

describe("variant switch route", () => {
  it("requires an owner and an exact retained model path", async () => {
    const switchVariant = vi.fn(async () => ({ versionId: "version-1", storageKey: "assets/asset-1/variants/version-1/high/model.gltf" }));
    const getAsset = vi.fn(async (_assetId: string, ownerId: string) => ownerId === "owner-1" ? { status: "ready" } : null);
    const handler = createVariantSwitchHandler({ getSession: vi.fn(async (headers) => ["owner-1", "owner-2"].includes(headers.get("authorization") ?? "") ? { user: { id: headers.get("authorization")! } } : null), getAsset, switchVariant });
    const request = (auth: string, selectedModelPath: unknown) => new Request("http://localhost/api/assets/asset-1/variant", { method: "PATCH", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ selectedModelPath }) });
    expect((await handler(request("other", "high/model.gltf"), "asset-1")).status).toBe(401);
    expect((await handler(request("owner-2", "high/model.gltf"), "asset-1")).status).toBe(404);
    expect((await handler(request("owner-1", ""), "asset-1")).status).toBe(400);
    expect((await handler(request("owner-1", "high/model.gltf"), "asset-1")).status).toBe(200);
    expect(switchVariant).toHaveBeenCalledOnce();
    expect(switchVariant).toHaveBeenCalledWith({ ownerId: "owner-1", assetId: "asset-1", selectedModelPath: "high/model.gltf" });
  });
});
