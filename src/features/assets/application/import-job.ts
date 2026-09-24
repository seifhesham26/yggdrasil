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
  files: Array<{ byteSize: number }>;
  stage: (index: number) => Promise<void>;
  analyze: () => Promise<void>;
  commit: () => Promise<void>;
  cleanup: (scope: "staging" | "all") => Promise<void>;
  store: ImportJobStore;
  signal?: AbortSignal;
  onProgress?: (checkpoint: ImportJobCheckpoint) => void;
};

export async function runImportJob(input: ImportJobInput): Promise<ImportJobCheckpoint> {
  const previous = await input.store.read();
  if (previous.phase === "completed" || previous.phase === "cancelled") return previous;
  const checkpoint: ImportJobCheckpoint = {
    phase: previous.phase === "failed" ? "staging" : previous.phase,
    nextFile: previous.nextFile,
    processedBytes: previous.processedBytes,
    totalBytes: input.files.reduce((total, file) => total + file.byteSize, 0),
  };
  const save = async () => { await input.store.write({ ...checkpoint }); input.onProgress?.({ ...checkpoint }); };
  const stop = async (): Promise<ImportJobCheckpoint> => {
    await input.cleanup("all");
    checkpoint.phase = "cancelled";
    checkpoint.nextFile = 0;
    checkpoint.processedBytes = 0;
    await save();
    return checkpoint;
  };
  try {
    checkpoint.phase = "staging";
    await save();
    for (; checkpoint.nextFile < input.files.length; checkpoint.nextFile++) {
      if (input.signal?.aborted) return stop();
      const file = input.files[checkpoint.nextFile];
      await input.stage(checkpoint.nextFile);
      if (input.signal?.aborted) return stop();
      checkpoint.processedBytes += file.byteSize;
      await save();
    }
    checkpoint.phase = "analyzing";
    await save();
    await input.analyze();
    if (input.signal?.aborted) return stop();
    checkpoint.phase = "committing";
    await save();
    await input.commit();
    checkpoint.phase = "completed";
    await save();
    return checkpoint;
  } catch (error) {
    await input.cleanup("staging");
    checkpoint.phase = "failed";
    checkpoint.nextFile = 0;
    checkpoint.processedBytes = 0;
    checkpoint.errorCode = error instanceof Error ? error.name : "IMPORT_FAILED";
    await save();
    throw error;
  }
}
