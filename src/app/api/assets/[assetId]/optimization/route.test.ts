import { describe, expect, it, vi } from "vitest";
import type { AssetDetail } from "@/features/assets/infrastructure/asset-repository";
import { createOptimizationHandler } from "./handler";

const asset = { id: "asset-1", ownerId: "owner-1", name: "Triangle", status: "ready", errorCode: null, createdAt: new Date(), updatedAt: new Date(), byteSize: 100, format: "glTF", counts: null, files: [], analysis: null } as AssetDetail;

describe("GET /api/assets/:assetId/optimization", () => {
  it("does not reveal private findings without the owner session", async () => {
    const getAsset = vi.fn(); const response = await createOptimizationHandler({ getSession: async () => null, getAsset })("asset-1");
    expect(response.status).toBe(401); expect(getAsset).not.toHaveBeenCalled();
  });
  it("scopes findings through the authenticated owner", async () => {
    const getAsset = vi.fn(async (_id: string, ownerId: string) => ownerId === "owner-1" ? asset : null);
    const response = await createOptimizationHandler({ getSession: async () => ({ user: { id: "owner-1" } }), getAsset })("asset-1");
    expect(response.status).toBe(200); expect(getAsset).toHaveBeenCalledWith("asset-1", "owner-1"); expect(await response.json()).toEqual({ state: "no-recommendations", findings: [] });
  });
});
