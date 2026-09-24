// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runImportJob, type ImportJobCheckpoint, type ImportJobStore } from "./import-job";

function store(initial: ImportJobCheckpoint): ImportJobStore & { value: ImportJobCheckpoint } {
  return { value: initial, async read() { return this.value; }, async write(value) { this.value = value; } };
}

describe("runImportJob", () => {
  it("resumes after a staged-file checkpoint without restaging prior files", async () => {
    const saved = store({ phase: "staging", nextFile: 1, processedBytes: 2, totalBytes: 0 });
    const staged: number[] = [];
    const result = await runImportJob({
      files: [{ byteSize: 2 }, { byteSize: 1 }],
      stage: async (index) => { staged.push(index); }, analyze: async () => {}, commit: async () => {}, cleanup: async () => {}, store: saved,
    });
    expect(staged).toEqual([1]);
    expect(result.phase).toBe("completed");
    expect(result.processedBytes).toBe(3);
  });

  it("cleans temporary work and records cancellation at a safe boundary", async () => {
    const saved = store({ phase: "received", nextFile: 0, processedBytes: 0, totalBytes: 0 });
    const controller = new AbortController();
    let cleaned = 0;
    const result = await runImportJob({
      files: [{ byteSize: 1 }], stage: async () => { controller.abort(); }, analyze: async () => {}, commit: async () => {}, cleanup: async (scope) => { expect(scope).toBe("all"); cleaned++; }, store: saved, signal: controller.signal,
    });
    expect(result.phase).toBe("cancelled");
    expect(cleaned).toBe(1);
    expect(saved.value.nextFile).toBe(0);
  });

  it("resets the staged checkpoint after failure cleanup so retry cannot skip a missing file", async () => {
    const saved = store({ phase: "received", nextFile: 0, processedBytes: 0, totalBytes: 0 });
    let attempts = 0;
    await expect(runImportJob({
      files: [{ byteSize: 1 }, { byteSize: 1 }],
      stage: async () => { if (++attempts === 2) throw new Error("disk full"); },
      analyze: async () => {}, commit: async () => {}, cleanup: async () => {}, store: saved,
    })).rejects.toThrow("disk full");
    expect(saved.value).toMatchObject({ phase: "failed", nextFile: 0, processedBytes: 0 });
  });

  it("honors cancellation after analysis and before committing", async () => {
    const saved = store({ phase: "received", nextFile: 0, processedBytes: 0, totalBytes: 0 });
    const controller = new AbortController();
    let commits = 0;
    const result = await runImportJob({
      files: [{ byteSize: 1 }], stage: async () => {}, analyze: async () => { controller.abort(); },
      commit: async () => { commits++; }, cleanup: async () => {}, store: saved, signal: controller.signal,
    });
    expect(result.phase).toBe("cancelled");
    expect(commits).toBe(0);
  });
});
