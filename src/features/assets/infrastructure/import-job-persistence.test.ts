// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { user } from "@/db/schema/auth";
import { importJobs } from "@/db/schema/assets";
import { eq } from "drizzle-orm";
import { migrateTestDatabase, ownerId, postgres, resetTestDatabase } from "@/test/optimization-database";
import { testDb } from "@/test/optimization-database";
import { DrizzleImportJobRepository } from "./import-job-persistence";

vi.mock("@/db/client", async () => ({ db: (await import("@/test/optimization-database")).testDb }));
beforeAll(migrateTestDatabase, 30_000);
afterEach(resetTestDatabase);
afterAll(() => postgres.close());

async function owner() {
  await testDb.insert(user).values({ id: ownerId, email: "job-owner@example.test", name: "Job owner" });
}

describe("Drizzle import job persistence", () => {
  it("persists source metadata and safe phase checkpoints across repository instances", async () => {
    await owner();
    const repo = new DrizzleImportJobRepository();
    const created = await repo.create({
      ownerId, name: "Dragon", uploadPrefix: "staging/upload-private", totalBytes: 4,
      files: [{ relativePath: "model.glb", storageKey: "staging/upload-private/0.part", byteSize: 4, sha256: "abcd" }],
    });
    await repo.forJob(ownerId, created.id).write({ phase: "staging", nextFile: 1, processedBytes: 4, totalBytes: 4 });
    const reopened = await new DrizzleImportJobRepository().get(ownerId, created.id);
    expect(reopened).toMatchObject({ name: "Dragon", phase: "staging", nextFile: 1, processedBytes: 4, files: created.files });
    expect(await repo.get("another-owner", created.id)).toBeNull();
    await expect(repo.forJob("another-owner", created.id).read()).rejects.toThrow();
  });

  it("records cancellation only for its owner and retries failed checkpoints from zero", async () => {
    await owner();
    const repo = new DrizzleImportJobRepository();
    const job = await repo.create({ ownerId, name: "Dragon", uploadPrefix: "staging/upload-private", totalBytes: 4, files: [] });
    expect(await repo.requestCancel("another-owner", job.id)).toBe(false);
    expect(await repo.requestCancel(ownerId, job.id)).toBe(true);
    expect((await repo.get(ownerId, job.id))?.cancelRequested).toBe(true);
    await repo.forJob(ownerId, job.id).write({ phase: "failed", nextFile: 1, processedBytes: 2, totalBytes: 4, errorCode: "IMPORT_FAILED" });
    const retried = await repo.retry(ownerId, job.id);
    expect(retried).toMatchObject({ phase: "received", nextFile: 0, processedBytes: 0, cancelRequested: false, errorCode: null });
    expect(await repo.retry(ownerId, job.id)).toBeNull();
  });

  it("rejects job metadata that could escape its protected upload prefix", async () => {
    await owner();
    const repo = new DrizzleImportJobRepository();
    await expect(repo.create({ ownerId, name: "Unsafe", uploadPrefix: "../outside", files: [], totalBytes: 0 })).rejects.toThrow();
    await expect(repo.create({ ownerId, name: "Unsafe", uploadPrefix: "staging/upload-private", files: [
      { relativePath: "model.glb", storageKey: "assets/another/source/model.glb", byteSize: 1, sha256: "abcd" },
    ], totalBytes: 1 })).rejects.toThrow();
  });

  it("does not request cancellation after a job is complete", async () => {
    await owner();
    const repo = new DrizzleImportJobRepository();
    const job = await repo.create({ ownerId, name: "Done", uploadPrefix: "staging/upload-private", files: [], totalBytes: 0 });
    await repo.forJob(ownerId, job.id).write({ phase: "completed", nextFile: 0, processedBytes: 0, totalBytes: 0 });
    expect(await repo.requestCancel(ownerId, job.id)).toBe(false);
    expect((await repo.get(ownerId, job.id))?.cancelRequested).toBe(false);
  });

  it("does not request cancellation after promotion has started", async () => {
    await owner();
    const repo = new DrizzleImportJobRepository();
    const job = await repo.create({ ownerId, name: "Committing", uploadPrefix: "staging/upload-private", files: [], totalBytes: 0 });
    await repo.forJob(ownerId, job.id).write({ phase: "committing", nextFile: 0, processedBytes: 0, totalBytes: 0 });
    expect(await repo.requestCancel(ownerId, job.id)).toBe(false);
    expect((await repo.get(ownerId, job.id))?.cancelRequested).toBe(false);
  });

  it("claims a job once and permits recovery only after its lease expires", async () => {
    await owner();
    const repo = new DrizzleImportJobRepository();
    const job = await repo.create({ ownerId, name: "Recover", uploadPrefix: "staging/upload-private", files: [], totalBytes: 0 });
    expect(await repo.claim(ownerId, job.id)).toMatchObject({ phase: "staging" });
    expect(await repo.claim(ownerId, job.id)).toBeNull();
    await testDb.update(importJobs).set({ leaseUntil: new Date(Date.now() - 1000) }).where(eq(importJobs.id, job.id));
    expect(await new DrizzleImportJobRepository().claim(ownerId, job.id)).toMatchObject({ id: job.id, phase: "staging" });
    expect(await repo.claim("another-owner", job.id)).toBeNull();
  });
});
