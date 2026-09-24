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
  operation: OptimizationOperation | "original";
  createdAt: Date;
};
export type OptimizationSettings = { keepExtras: boolean };
export type OptimizationAttempt = { id: string; ownerId: string; assetId: string; versionId: string; parentVersionId: string; operation: OptimizationOperation; settings: OptimizationSettings; retryOf?: string; status: "succeeded" | "failed"; error?: string; createdAt: Date };

export type OptimizationPersistenceSnapshot = {
  versions: OptimizationVersion[];
  attempts: OptimizationAttempt[];
  currentVersionId?: string;
};

export interface OptimizationPersistence {
  promote(version: OptimizationVersion, attempt: OptimizationAttempt): void | Promise<void>;
  saveVersion(version: OptimizationVersion): void | Promise<void>;
  saveAttempt(attempt: OptimizationAttempt): void | Promise<void>;
  setCurrent(ownerId: string, assetId: string, versionId: string): void | Promise<void>;
  load(ownerId: string, assetId: string): OptimizationPersistenceSnapshot | Promise<OptimizationPersistenceSnapshot>;
}

export class InMemoryOptimizationPersistence implements OptimizationPersistence {
  private readonly versions = new Map<string, OptimizationVersion>();
  private readonly attempts: OptimizationAttempt[] = [];
  private readonly current = new Map<string, string>();

  promote(version: OptimizationVersion, attempt: OptimizationAttempt): void {
    this.versions.set(version.id, version);
    this.attempts.push(attempt);
    this.current.set(`${version.ownerId}:${version.assetId}`, version.id);
  }
  saveVersion(version: OptimizationVersion): void { this.versions.set(version.id, version); }
  saveAttempt(attempt: OptimizationAttempt): void { this.attempts.push(attempt); }
  setCurrent(ownerId: string, assetId: string, versionId: string): void { this.current.set(`${ownerId}:${assetId}`, versionId); }
  load(ownerId: string, assetId: string): OptimizationPersistenceSnapshot {
    return {
      versions: [...this.versions.values()].filter((version) => version.ownerId === ownerId && version.assetId === assetId),
      attempts: this.attempts.filter((attempt) => attempt.ownerId === ownerId && attempt.assetId === assetId),
      currentVersionId: this.current.get(`${ownerId}:${assetId}`),
    };
  }
}

export class ReversibleOptimizationHistory {
  private readonly versions = new Map<string, OptimizationVersion>();
  private readonly current = new Map<string, string>();
  private readonly attempts: OptimizationAttempt[] = [];

  constructor(private readonly storage: AssetStorage, private readonly analyze: (storage: AssetStorage, key: StorageKey) => Promise<AssetAnalysis>, private readonly createId: () => string = () => crypto.randomUUID(), private readonly persistence?: OptimizationPersistence) {}

  async seedOriginal(input: Omit<OptimizationVersion, "createdAt" | "operation">): Promise<void> {
    const version: OptimizationVersion = { ...input, operation: "original", createdAt: new Date() };
    await this.persistence?.saveVersion(version);
    await this.persistence?.setCurrent(input.ownerId, input.assetId, input.id);
    this.versions.set(input.id, version);
    this.current.set(`${input.ownerId}:${input.assetId}`, input.id);
  }

  async reload(ownerId: string, assetId: string): Promise<void> {
    if (!this.persistence) return;
    const snapshot = await this.persistence.load(ownerId, assetId);
    for (const version of this.list(ownerId, assetId)) this.versions.delete(version.id);
    for (let index = this.attempts.length - 1; index >= 0; index--) {
      if (this.attempts[index].ownerId === ownerId && this.attempts[index].assetId === assetId) this.attempts.splice(index, 1);
    }
    this.current.delete(`${ownerId}:${assetId}`);
    for (const version of snapshot.versions) this.versions.set(version.id, version);
    this.attempts.push(...snapshot.attempts);
    if (snapshot.currentVersionId) this.current.set(`${ownerId}:${assetId}`, snapshot.currentVersionId);
  }

  async apply(input: { ownerId: string; assetId: string; operation: OptimizationOperation; approve: boolean; settings?: OptimizationSettings }): Promise<OptimizationVersion> {
    if (!input.approve) throw new Error("Owner approval is required before an optimization runs.");
    const parentId = this.current.get(`${input.ownerId}:${input.assetId}`);
    return this.applyFrom(input, parentId);
  }

  private async applyFrom(input: { ownerId: string; assetId: string; operation: OptimizationOperation; settings?: OptimizationSettings }, parentId?: string, retryOf?: string): Promise<OptimizationVersion> {
    const parent = parentId ? this.versions.get(parentId) : undefined;
    if (!parent || parent.ownerId !== input.ownerId || parent.assetId !== input.assetId || !(await this.storage.exists(parent.storageKey))) throw new Error("Asset version is not available to this owner.");
    const settings = { keepExtras: input.settings?.keepExtras ?? true };
    const attemptId = this.createId(); const versionId = this.createId();
    const outputKey = optimizedStorageKey(input.assetId, versionId);
    const attemptBase = { id: attemptId, ownerId: input.ownerId, assetId: input.assetId, versionId, parentVersionId: parent.id, operation: input.operation, settings, retryOf, createdAt: new Date() };
    let outputOwned = false;
    let promotionStarted = false;
    try {
      const output = await processOptimization(this.storage, parseStorageKey(parent.storageKey), input.operation, settings);
      if (await this.storage.exists(outputKey)) throw new Error("Output version already exists.");
      outputOwned = true;
      await this.storage.put(outputKey, output.bytes);
      const analysis = await this.analyze(this.storage, outputKey);
      const version: OptimizationVersion = { id: versionId, assetId: input.assetId, ownerId: input.ownerId, parentVersionId: parent.id, storageKey: outputKey, sha256: createHash("sha256").update(output.bytes).digest("hex"), byteSize: output.bytes.byteLength, analysis, operation: input.operation, createdAt: new Date() };
      const attempt = { ...attemptBase, status: "succeeded" as const };
      promotionStarted = true;
      await this.persistence?.promote(version, attempt);
      this.versions.set(version.id, version); this.current.set(`${input.ownerId}:${input.assetId}`, version.id);
      this.attempts.push(attempt);
      return version;
    } catch (error) {
      // Reconcile a lost COMMIT acknowledgement before deleting any binary. If
      // the database is unreachable, leave protected output for reconciliation.
      if (promotionStarted && this.persistence) {
        await this.reload(input.ownerId, input.assetId);
        const committed = this.versions.get(versionId);
        if (committed) return committed;
      }
      const attempt = { ...attemptBase, status: "failed" as const, error: error instanceof Error ? error.message : "Optimization failed" };
      this.attempts.push(attempt); await this.persistence?.saveAttempt(attempt);
      if (outputOwned) await this.storage.removeTree(parseStorageKey(`assets/${input.assetId}/versions/${versionId}`));
      throw error;
    }
  }

  list(ownerId: string, assetId: string): OptimizationVersion[] { return [...this.versions.values()].filter((version) => version.ownerId === ownerId && version.assetId === assetId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); }
  attemptsFor(ownerId: string, assetId: string): OptimizationAttempt[] { return this.attempts.filter((attempt) => attempt.ownerId === ownerId && attempt.assetId === assetId); }
  async retry(ownerId: string, assetId: string): Promise<OptimizationVersion> {
    const failed = [...this.attemptsFor(ownerId, assetId)].reverse().find((attempt) => attempt.status === "failed");
    if (!failed) throw new Error("No failed optimization is available to retry.");
    return this.applyFrom({ ownerId, assetId, operation: failed.operation, settings: failed.settings }, failed.parentVersionId, failed.id);
  }
  async revert(ownerId: string, assetId: string, versionId: string): Promise<void> {
    const version = this.versions.get(versionId);
    if (!version || version.ownerId !== ownerId || version.assetId !== assetId || !(await this.storage.exists(version.storageKey))) throw new Error("Asset version is not available to this owner.");
    await this.persistence?.setCurrent(ownerId, assetId, versionId);
    this.current.set(`${ownerId}:${assetId}`, versionId);
  }
  currentVersion(ownerId: string, assetId: string): OptimizationVersion | undefined { const id = this.current.get(`${ownerId}:${assetId}`); return id ? this.versions.get(id) : undefined; }
}
