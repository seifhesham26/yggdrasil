import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as schema from "@/db/schema";
import { LocalAssetStorage } from "@/lib/storage/local-storage";
import { parseStorageKey } from "@/lib/storage/storage-key";
import { createGltfFixture } from "./fixtures/create-gltf-fixture";
import { analyzeGltf } from "@/features/assets/infrastructure/gltf-analyzer";

// Real PostgreSQL SQL/constraints/transactions, in WASM; no external owner data.
export const postgres = new PGlite();
export const testDb = drizzle(postgres, { schema });
export const ownerId = "test-owner";
const roots: string[] = [];

export async function migrateTestDatabase() {
  for (const file of (await readdir("drizzle")).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    await postgres.exec(await readFile(join("drizzle", file), "utf8"));
  }
}

export async function resetTestDatabase() {
  for (const table of ["asset_versions", "scene_analyses", "optimization_operations", "assets"]) {
    await postgres.exec(`DROP TRIGGER IF EXISTS fail_write ON ${table}`);
  }
  await postgres.exec('TRUNCATE "user" CASCADE');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

export async function importedFixture() {
  const { DrizzleAssetRepository } = await import("@/features/assets/infrastructure/asset-repository");
  await testDb.insert(schema.user).values({ id: ownerId, email: "fixture@example.test", name: "Fixture" }).onConflictDoNothing();
  const repository = new DrizzleAssetRepository();
  const { assetId, sourceId } = await repository.createImport({ ownerId, name: "Triangle" });
  const root = await mkdtemp(join(tmpdir(), "yggdrasil-sql-"));
  roots.push(root);
  const storage = new LocalAssetStorage(root);
  const fixture = createGltfFixture();
  const files = await Promise.all([fixture.model, fixture.binary].map(async (file, index) => {
    const storageKey = parseStorageKey(`assets/${assetId}/source/${file.relativePath}`);
    await storage.put(storageKey, file.bytes);
    return { relativePath: file.relativePath, storageKey, byteSize: file.bytes.length, sha256: createHash("sha256").update(file.bytes).digest("hex"), mimeType: index === 0 ? "model/gltf+json" : "application/octet-stream", role: index === 0 ? "model" as const : "dependency" as const };
  }));
  const analysis = await analyzeGltf(storage, files[0].storageKey);
  await repository.completeImport({ ownerId, assetId, sourceId, files, analysis });
  const [original] = await testDb.select().from(schema.assetVersions).where(eq(schema.assetVersions.assetId, assetId));
  return { assetId, sourceId, storage, root, original, files, repository, analysis };
}

export async function failWrite(table: string, event: string, condition = "true") {
  await postgres.exec(`CREATE OR REPLACE FUNCTION fail_test_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected write failure'; END $$;
    CREATE TRIGGER fail_write BEFORE ${event} ON ${table} FOR EACH ROW WHEN (${condition}) EXECUTE FUNCTION fail_test_write();`);
}
