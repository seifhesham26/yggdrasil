import { and, eq, inArray, isNull, lt, notInArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { importJobs } from "@/db/schema/assets";
import { parseStorageKey } from "@/lib/storage/storage-key";
import type { ImportJobCheckpoint, ImportJobStore } from "../application/import-job";
import type { ImportJobFile } from "../domain/types";

export type ImportJobRecord = typeof importJobs.$inferSelect;

export class DrizzleImportJobRepository {
  async create(input: { ownerId: string; name: string; uploadPrefix: string; files: ImportJobFile[]; totalBytes: number }): Promise<ImportJobRecord> {
    const prefix = parseStorageKey(input.uploadPrefix);
    if (!prefix.startsWith("staging/upload-") || !Number.isSafeInteger(input.totalBytes) || input.totalBytes < 0) throw new Error("Invalid import job metadata");
    for (const file of input.files) {
      const key = parseStorageKey(file.storageKey);
      if (!key.startsWith(`${prefix}/`) || !Number.isSafeInteger(file.byteSize) || file.byteSize < 0) throw new Error("Import file escapes its upload prefix");
    }
    const [job] = await db.insert(importJobs).values(input).returning();
    return job;
  }

  async get(ownerId: string, jobId: string): Promise<ImportJobRecord | null> {
    const [job] = await db.select().from(importJobs).where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId))).limit(1);
    return job ?? null;
  }

  async claim(ownerId: string, jobId: string): Promise<ImportJobRecord | null> {
    const now = new Date();
    const [job] = await db.update(importJobs).set({ phase: "staging", leaseUntil: new Date(now.getTime() + 15_000), updatedAt: now })
      .where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId), eq(importJobs.cancelRequested, false), or(
        eq(importJobs.phase, "received"),
        and(inArray(importJobs.phase, ["staging", "analyzing", "committing"]), or(isNull(importJobs.leaseUntil), lt(importJobs.leaseUntil, now))),
      ))).returning();
    return job ?? null;
  }

  async progress(ownerId: string, jobId: string, checkpoint: ImportJobCheckpoint): Promise<void> {
    const [job] = await db.update(importJobs).set({
      phase: checkpoint.phase, nextFile: checkpoint.nextFile, processedBytes: checkpoint.processedBytes,
      totalBytes: checkpoint.totalBytes, errorCode: checkpoint.errorCode ?? null,
      leaseUntil: new Date(Date.now() + 15_000), updatedAt: new Date(),
    }).where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId), eq(importJobs.cancelRequested, false), inArray(importJobs.phase, ["staging", "analyzing", "committing"])))
      .returning({ id: importJobs.id });
    if (!job) throw new Error("Import job is not active");
  }

  async heartbeat(ownerId: string, jobId: string): Promise<void> {
    await db.update(importJobs).set({ leaseUntil: new Date(Date.now() + 15_000) })
      .where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId), inArray(importJobs.phase, ["staging", "analyzing", "committing"])));
  }

  async complete(ownerId: string, jobId: string, assetId: string): Promise<void> {
    const [job] = await db.update(importJobs).set({ phase: "completed", assetId, leaseUntil: null, processedBytes: importJobs.totalBytes, errorCode: null, updatedAt: new Date() })
      .where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId), eq(importJobs.cancelRequested, false), inArray(importJobs.phase, ["staging", "analyzing", "committing"]))).returning({ id: importJobs.id });
    if (!job) throw new Error("Import job not found");
  }

  async fail(ownerId: string, jobId: string, errorCode: string): Promise<void> {
    const [job] = await db.update(importJobs).set({ phase: "failed", errorCode, leaseUntil: null, updatedAt: new Date() })
      .where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId), inArray(importJobs.phase, ["staging", "analyzing", "committing"]))).returning({ id: importJobs.id });
    if (!job) throw new Error("Import job not found");
  }

  async markCancelled(ownerId: string, jobId: string): Promise<void> {
    const [job] = await db.update(importJobs).set({ phase: "cancelled", cancelRequested: true, leaseUntil: null, updatedAt: new Date() })
      .where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId), eq(importJobs.cancelRequested, false), inArray(importJobs.phase, ["received", "staging", "analyzing", "failed"]))).returning({ id: importJobs.id });
    if (!job) throw new Error("Import job cannot be cancelled");
  }

  forJob(ownerId: string, jobId: string): ImportJobStore {
    return {
      read: async () => {
        const job = await this.get(ownerId, jobId);
        if (!job) throw new Error("Import job not found");
        return { phase: job.phase, nextFile: job.nextFile, processedBytes: job.processedBytes, totalBytes: job.totalBytes, errorCode: job.errorCode ?? undefined };
      },
      write: async (checkpoint: ImportJobCheckpoint) => {
        if (checkpoint.nextFile < 0 || checkpoint.processedBytes < 0 || checkpoint.processedBytes > checkpoint.totalBytes) throw new Error("Invalid import checkpoint");
        const [job] = await db.update(importJobs).set({
          phase: checkpoint.phase, nextFile: checkpoint.nextFile, processedBytes: checkpoint.processedBytes,
          totalBytes: checkpoint.totalBytes, errorCode: checkpoint.errorCode ?? null, updatedAt: new Date(),
        }).where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId))).returning({ id: importJobs.id });
        if (!job) throw new Error("Import job not found");
      },
    };
  }

  async requestCancel(ownerId: string, jobId: string): Promise<boolean> {
    const [updated] = await db.update(importJobs).set({ cancelRequested: true, updatedAt: new Date() })
      .where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId), eq(importJobs.cancelRequested, false), inArray(importJobs.phase, ["received", "staging", "analyzing"]))).returning({ id: importJobs.id });
    return Boolean(updated);
  }

  async retry(ownerId: string, jobId: string): Promise<ImportJobRecord | null> {
    const [job] = await db.update(importJobs).set({
      phase: "received", nextFile: 0, processedBytes: 0, errorCode: null, cancelRequested: false, updatedAt: new Date(),
    }).where(and(eq(importJobs.id, jobId), eq(importJobs.ownerId, ownerId), eq(importJobs.phase, "failed"))).returning();
    return job ?? null;
  }
}
