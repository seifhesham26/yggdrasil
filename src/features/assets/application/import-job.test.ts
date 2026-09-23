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
      files: [{ bytes: new Uint8Array([1, 2]) }, { bytes: new Uint8Array([3]) }],
      stage: async (_file, index) => { staged.push(index); }, analyze: async () => {}, commit: async () => {}, cleanup: async () => {}, store: saved,
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
      files: [{ bytes: new Uint8Array([1]) }], stage: async () => { controller.abort(); }, analyze: async () => {}, commit: async () => {}, cleanup: async () => { cleaned++; }, store: saved, signal: controller.signal,
    });
    expect(result.phase).toBe("cancelled");
    expect(cleaned).toBe(1);
    expect(saved.value.nextFile).toBe(0);
  });
});
