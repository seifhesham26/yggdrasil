import { describe, expect, it, vi } from "vitest";
import type { AssetDetail } from "@/features/assets/infrastructure/asset-repository";
import { createOptimizationHandler } from "./handler";
import { createOptimizationMutationHandler } from "./handler";

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

describe("protected optimization mutations", () => {
  it("does not acknowledge a deferred revert until it finishes", async () => {
    let finish!: () => void;
    const pendingRevert = new Promise<void>((resolve) => { finish = resolve; });
    const handler = createOptimizationMutationHandler({ getSession: async () => ({ user: { id: "owner-1" } }), getHistory: async () => ({ ...history, revert: () => pendingRevert }) });
    let settled = false;
    const pending = handler("asset-1", new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "revert", versionId: "v1" }) })).then((response) => { settled = true; return response; });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    finish();
    expect((await pending).status).toBe(200);
  });
  const history = {
    apply: vi.fn(async () => ({ id: "v2" })),
    retry: vi.fn(async () => ({ id: "v2" })),
    revert: vi.fn(),
    list: vi.fn(() => []),
    attemptsFor: vi.fn(() => []),
    currentVersion: vi.fn(() => undefined),
  };

  it("requires the owner session before applying", async () => {
    const handler = createOptimizationMutationHandler({ getSession: async () => null, getHistory: async () => history });
    const response = await handler("asset-1", new Request("http://localhost", { method: "POST", body: JSON.stringify({ operation: "normalize", approve: true }) }));
    expect(response.status).toBe(401); expect(history.apply).not.toHaveBeenCalled();
  });

  it("applies, compares, reverts, and retries only through the owner history", async () => {
    const handler = createOptimizationMutationHandler({ getSession: async () => ({ user: { id: "owner-1" } }), getHistory: async (assetId, ownerId) => assetId === "asset-1" && ownerId === "owner-1" ? history : null });
    const applied = await handler("asset-1", new Request("http://localhost", { method: "POST", body: JSON.stringify({ operation: "normalize", approve: true }) }));
    expect(applied.status).toBe(200); expect(history.apply).toHaveBeenCalledWith({ ownerId: "owner-1", assetId: "asset-1", operation: "normalize", approve: true });
    const compressed = await handler("asset-1", new Request("http://localhost", { method: "POST", body: JSON.stringify({ operation: "compress-geometry", approve: true, settings: { keepExtras: true, meshoptLevel: "medium" } }) }));
    expect(compressed.status).toBe(200); expect(history.apply).toHaveBeenCalledWith({ ownerId: "owner-1", assetId: "asset-1", operation: "compress-geometry", approve: true, settings: { keepExtras: true, meshoptLevel: "medium" } });
    const compared = await handler("asset-1", new Request("http://localhost", { method: "GET" }));
    expect(compared.status).toBe(200);
    const reverted = await handler("asset-1", new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "revert", versionId: "v1" }) }));
    expect(reverted.status).toBe(200); expect(history.revert).toHaveBeenCalledWith("owner-1", "asset-1", "v1");
    const retried = await handler("asset-1", new Request("http://localhost", { method: "POST", body: JSON.stringify({ action: "retry" }) }));
    expect(retried.status).toBe(200); expect(history.retry).toHaveBeenCalledWith("owner-1", "asset-1");
  });
});
