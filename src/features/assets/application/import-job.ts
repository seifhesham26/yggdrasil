export type ImportJobPhase = "received" | "staging" | "analyzing" | "committing" | "completed" | "cancelled" | "failed";

export type ImportJobCheckpoint = {
  phase: ImportJobPhase;
  nextFile: number;
  processedBytes: number;
  totalBytes: number;
  errorCode?: string;
};

export interface ImportJobStore {
  read(): Promise<ImportJobCheckpoint>;
  write(checkpoint: ImportJobCheckpoint): Promise<void>;
}

export type ImportJobInput = {
  files: Array<{ bytes: Uint8Array }>;
  stage: (file: Uint8Array, index: number) => Promise<void>;
  analyze: () => Promise<void>;
  commit: () => Promise<void>;
  cleanup: () => Promise<void>;
  store: ImportJobStore;
  signal?: AbortSignal;
  onProgress?: (checkpoint: ImportJobCheckpoint) => void;
};

function cancelled(checkpoint: ImportJobCheckpoint): ImportJobCheckpoint {
  return { ...checkpoint, phase: "cancelled" };
}

export async function runImportJob(input: ImportJobInput): Promise<ImportJobCheckpoint> {
  const previous = await input.store.read();
  const checkpoint: ImportJobCheckpoint = {
    phase: previous.phase === "cancelled" || previous.phase === "failed" ? "staging" : previous.phase,
    nextFile: previous.nextFile,
    processedBytes: previous.processedBytes,
    totalBytes: input.files.reduce((total, file) => total + file.bytes.byteLength, 0),
  };
  const save = async () => { await input.store.write({ ...checkpoint }); input.onProgress?.({ ...checkpoint }); };
  try {
    checkpoint.phase = "staging";
    await save();
    for (; checkpoint.nextFile < input.files.length; checkpoint.nextFile++) {
      if (input.signal?.aborted) {
        await input.cleanup();
        const result = cancelled(checkpoint);
        await input.store.write(result);
        input.onProgress?.(result);
        return result;
      }
      const file = input.files[checkpoint.nextFile];
      await input.stage(file.bytes, checkpoint.nextFile);
      if (input.signal?.aborted) {
        await input.cleanup();
        const result = cancelled(checkpoint);
        await input.store.write(result);
        input.onProgress?.(result);
        return result;
      }
      checkpoint.processedBytes += file.bytes.byteLength;
      await save();
    }
    checkpoint.phase = "analyzing";
    await save();
    await input.analyze();
    checkpoint.phase = "committing";
    await save();
    await input.commit();
    checkpoint.phase = "completed";
    await save();
    return checkpoint;
  } catch (error) {
    await input.cleanup();
    checkpoint.phase = "failed";
    checkpoint.errorCode = error instanceof Error ? error.name : "IMPORT_FAILED";
    await save();
    throw error;
  }
}
