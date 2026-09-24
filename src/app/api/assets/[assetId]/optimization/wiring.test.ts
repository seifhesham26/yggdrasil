// @vitest-environment node
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { testDb, postgres, importedFixture, migrateTestDatabase, resetTestDatabase, ownerId, failWrite } from "@/test/optimization-database";
import { assets, sceneAnalyses } from "@/db/schema/assets";
import { GET, POST, PATCH } from "./route";
import { GET as fileGET } from "../file/route";

const context = vi.hoisted(() => ({ root: "", session: { user: { id: "test-owner" } } as { user: { id: string } } | null }));
vi.mock("@/db/client", async () => ({ db: (await import("@/test/optimization-database")).testDb }));
vi.mock("@/auth/server-session", () => ({ getOwnerSession: async () => context.session }));
vi.mock("@/auth/auth", () => ({ auth: { api: { getSession: async () => context.session } } }));
vi.mock("@/lib/env/server", () => ({ serverEnv: { get YGGDRASIL_ASSET_ROOT() { return context.root; } } }));
beforeAll(migrateTestDatabase, 30_000);
afterEach(async () => { context.session = { user: { id: ownerId } }; await resetTestDatabase(); });
afterAll(() => postgres.close());

function request(assetId: string, method = "GET", body?: object) {
  return new Request(`http://localhost/api/assets/${assetId}/optimization?view=history`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
}

it("real routes reuse the imported original with null selection", async () => {
  const { assetId, root, original } = await importedFixture(); context.root = root;
  await testDb.update(assets).set({ currentVersionId: null }).where(eq(assets.id, assetId));
  const response = await GET(request(assetId), { params: Promise.resolve({ assetId }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ currentVersionId: original.id, versions: [{ id: original.id, operation: "original" }] });
});

it("real apply/file/revert routes and repository follow the selected version", async () => {
  const { assetId, root, original, repository, analysis, storage, files } = await importedFixture(); context.root = root;
  const source = await storage.read(files[0].storageKey);
  const params = { params: Promise.resolve({ assetId }) };
  const response = await POST(request(assetId, "POST", { operation: "normalize", approve: true }), params);
  expect(response.status).toBe(200);
  const derived = await response.json();
  const fileRequest = new Request(`http://localhost/api/assets/${assetId}/file?key=${encodeURIComponent(derived.storageKey)}`);
  const file = await fileGET(fileRequest, params);
  expect(file.status).toBe(200);
  expect(file.headers.get("cache-control")).toBe("private, no-store");
  expect((await file.arrayBuffer()).byteLength).toBe(derived.byteSize);
  // Distinct snapshots catch "latest analysis wins" after selection changes.
  await testDb.update(sceneAnalyses).set({ snapshot: { ...analysis, counts: { ...analysis.counts, triangles: 17 } } }).where(eq(sceneAnalyses.versionId, derived.id));
  const selected = await repository.getAsset(assetId, ownerId);
  expect(selected?.selectedFile?.storageKey).toBe(derived.storageKey);
  expect(selected?.analysis?.counts.triangles).toBe(17);
  const reverted = await PATCH(request(assetId, "PATCH", { action: "revert", versionId: original.id }), params);
  expect(reverted.status).toBe(200);
  const restored = await repository.getAsset(assetId, ownerId);
  expect(restored?.selectedFile?.storageKey).toBe(original.storageKey);
  expect(restored?.analysis?.counts.triangles).toBe(1);
  expect(restored?.byteSize).toBe(original.byteSize);
  expect((await repository.listAssets(ownerId))[0].counts?.triangles).toBe(1);
  expect((await fileGET(fileRequest, params)).status).toBe(200); // later versions retained
  expect(await storage.read(files[0].storageKey)).toEqual(source);
  const history = await (await GET(request(assetId), params)).json();
  expect(history.currentVersionId).toBe(original.id);
  expect(history.versions).toHaveLength(2);

  context.session = { user: { id: "other-owner" } };
  expect((await GET(request(assetId), params)).status).toBe(404);
  expect((await PATCH(request(assetId, "PATCH", { action: "revert", versionId: derived.id }), params)).status).toBe(404);
  expect((await fileGET(fileRequest, params)).status).toBe(404);
  context.session = null;
  expect((await fileGET(fileRequest, params)).status).toBe(401);
});

it("rejects another asset's retained version, and returns persistence failure without changing selection", async () => {
  const first = await importedFixture(); const second = await importedFixture(); context.root = first.root;
  const params = { params: Promise.resolve({ assetId: first.assetId }) };
  const other = await PATCH(request(first.assetId, "PATCH", { action: "revert", versionId: second.original.id }), params);
  expect(other.status).toBe(422);
  await failWrite("assets", "UPDATE");
  const failed = await PATCH(request(first.assetId, "PATCH", { action: "revert", versionId: first.original.id }), params);
  expect(failed.status).toBe(422);
  expect((await testDb.select().from(assets).where(eq(assets.id, first.assetId)))[0].currentVersionId).toBe(first.original.id);
});

it("rejects unsupported inputs and forged version IDs without promotion", async () => {
  const { assetId, root, original } = await importedFixture(); context.root = root;
  const params = { params: Promise.resolve({ assetId }) };
  expect((await POST(request(assetId, "POST", { operation: "unsupported-operation", approve: true }), params)).status).toBe(422);
  expect((await PATCH(request(assetId, "PATCH", { action: "revert", versionId: randomUUID() }), params)).status).toBe(422);
  const history = await (await GET(request(assetId), params)).json();
  expect(history.currentVersionId).toBe(original.id);
  expect(history.versions).toHaveLength(1);
  expect(history.attempts).toEqual([expect.objectContaining({ status: "failed", parentVersionId: original.id })]);
});
