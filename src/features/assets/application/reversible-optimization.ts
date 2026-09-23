import { createHash } from "node:crypto";
import type { AssetAnalysis } from "../domain/types";
import type { OptimizationOperation } from "../domain/optimization";
import { optimizedStorageKey, processOptimization } from "../infrastructure/optimization-processor";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey, type StorageKey } from "@/lib/storage/storage-key";

export type OptimizationVersion = {
  id: string;
  assetId: string;
  ownerId: string;
  parentVersionId: string;
  storageKey: StorageKey;
  sha256: string;
  byteSize: number;
  analysis: AssetAnalysis;
  operation: OptimizationOperation;
  createdAt: Date;
};
export type OptimizationAttempt = { id: string; ownerId: string; assetId: string; versionId: string; status: "succeeded" | "failed"; error?: string; createdAt: Date };

export class ReversibleOptimizationHistory {
  private readonly versions = new Map<string, OptimizationVersion>();
  private readonly current = new Map<string, string>();
  private readonly attempts: OptimizationAttempt[] = [];

  constructor(private readonly storage: AssetStorage, private readonly analyze: (storage: AssetStorage, key: StorageKey) => Promise<AssetAnalysis>, private readonly createId: () => string = () => crypto.randomUUID()) {}

  seedOriginal(input: Omit<OptimizationVersion, "createdAt" | "operation"> & { operation?: OptimizationOperation }): void {
    this.versions.set(input.id, { ...input, operation: input.operation ?? "normalize", createdAt: new Date() });
    this.current.set(`${input.ownerId}:${input.assetId}`, input.id);
  }

  async apply(input: { ownerId: string; assetId: string; operation: OptimizationOperation; approve: boolean }): Promise<OptimizationVersion> {
    if (!input.approve) throw new Error("Owner approval is required before an optimization runs.");
    const parentId = this.current.get(`${input.ownerId}:${input.assetId}`);
    const parent = parentId ? this.versions.get(parentId) : undefined;
    if (!parent || parent.ownerId !== input.ownerId) throw new Error("Asset version is not available to this owner.");
    const attemptId = this.createId(); const versionId = this.createId();
    const outputKey = optimizedStorageKey(input.assetId, versionId);
    try {
      const output = await processOptimization(this.storage, parseStorageKey(parent.storageKey), input.operation);
      await this.storage.put(outputKey, output.bytes);
      const analysis = await this.analyze(this.storage, outputKey);
      const version: OptimizationVersion = { id: versionId, assetId: input.assetId, ownerId: input.ownerId, parentVersionId: parent.id, storageKey: outputKey, sha256: createHash("sha256").update(output.bytes).digest("hex"), byteSize: output.bytes.byteLength, analysis, operation: input.operation, createdAt: new Date() };
      this.versions.set(version.id, version); this.current.set(`${input.ownerId}:${input.assetId}`, version.id);
      this.attempts.push({ id: attemptId, ownerId: input.ownerId, assetId: input.assetId, versionId, status: "succeeded", createdAt: new Date() });
      return version;
    } catch (error) {
      await this.storage.removeTree(parseStorageKey(`assets/${input.assetId}/versions/${versionId}`));
      this.attempts.push({ id: attemptId, ownerId: input.ownerId, assetId: input.assetId, versionId, status: "failed", error: error instanceof Error ? error.message : "Optimization failed", createdAt: new Date() });
      throw error;
    }
  }

  list(ownerId: string, assetId: string): OptimizationVersion[] { return [...this.versions.values()].filter((version) => version.ownerId === ownerId && version.assetId === assetId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); }
  attemptsFor(ownerId: string, assetId: string): OptimizationAttempt[] { return this.attempts.filter((attempt) => attempt.ownerId === ownerId && attempt.assetId === assetId); }
  revert(ownerId: string, assetId: string, versionId: string): void {
    const version = this.versions.get(versionId);
    if (!version || version.ownerId !== ownerId || version.assetId !== assetId) throw new Error("Asset version is not available to this owner.");
    this.current.set(`${ownerId}:${assetId}`, versionId);
  }
  currentVersion(ownerId: string, assetId: string): OptimizationVersion | undefined { const id = this.current.get(`${ownerId}:${assetId}`); return id ? this.versions.get(id) : undefined; }
}
