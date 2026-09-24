"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, FileArchive, FolderOpen, Layers3, UploadCloud } from "lucide-react";

type UploadResult = { assetId: string; status: string };
type Upload = (files: File[], onProgress: (sent: number, total: number) => void, signal: AbortSignal, onJob?: (jobId: string) => void) => Promise<UploadResult>;
type JobStatus = { jobId: string; phase: string; assetId?: string | null; errorCode?: string | null; processedBytes?: number; totalBytes?: number; leaseUntil?: string | null };
const activeJobKey = "yggdrasil.activeImportJob";

const errorMessages: Record<string, string> = {
  AMBIGUOUS_PRIMARY_MODEL: "This package contains more than one model. Select one model, or import them separately.",
  NO_PRIMARY_MODEL: "No glTF or GLB model was found. Add a model and try again.",
  INVALID_PATH: "A file path in this package is unsafe. Check the folder or ZIP and try again.",
  INVALID_ARCHIVE: "The ZIP could not be read safely. Check the archive and try again.",
  ARCHIVE_LIMIT_EXCEEDED: "This archive is too large or expands too much. Split it into smaller packages.",
  INVALID_FILE: "A file does not match its type or the model is invalid. Check the source package.",
  MISSING_DEPENDENCY: "A model dependency is missing. Check the named MTL or texture file and try again.",
  UNSUPPORTED_FILE: "This package contains an unsupported file. Keep only model files, textures, binaries, and license text.",
  IMPORT_FAILED: "The import could not be saved. Check your database connection and try again.",
  UPLOAD_TOO_LARGE: "This upload exceeds the package limit. Split it into smaller packages.",
  TOO_MANY_FILES: "This upload contains too many files. Split it into smaller packages.",
  INVALID_MULTIPART: "The upload was interrupted. Try again.",
  INVALID_MANIFEST: "The selected folder paths could not be read. Choose the files again.",
  IMPORT_CANCELLED: "Import cancelled.",
};

async function jobRequest(url: string, options?: RequestInit): Promise<JobStatus> {
  const response = await fetch(url, options);
  const data = await response.json() as JobStatus & { code?: string };
  if (!response.ok) throw Object.assign(new Error(data.code ?? "Import failed"), { code: data.code ?? "IMPORT_FAILED", status: response.status });
  return data;
}

async function runJob(jobId: string): Promise<UploadResult> {
  const url = `/api/assets/import/jobs/${encodeURIComponent(jobId)}`;
  let result = await jobRequest(`${url}/run`, { method: "POST" }).catch(async (error: Error & { status?: number }) => {
    if (error.status !== 409) throw error;
    return jobRequest(url);
  });
  while (result.phase !== "completed" && result.phase !== "failed" && result.phase !== "cancelled") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await jobRequest(url);
    if (result.phase === "received" || (result.leaseUntil && Date.parse(result.leaseUntil) < Date.now())) {
      result = await jobRequest(`${url}/run`, { method: "POST" }).catch(async (error: Error & { status?: number }) => {
        if (error.status !== 409) throw error;
        return jobRequest(url);
      });
    }
  }
  if (result.phase !== "completed" || !result.assetId) {
    if (result.phase === "cancelled") localStorage.removeItem(activeJobKey);
    throw Object.assign(new Error(result.phase === "cancelled" ? "Import cancelled" : "Import failed"), { code: result.errorCode ?? (result.phase === "cancelled" ? "IMPORT_CANCELLED" : "IMPORT_FAILED") });
  }
  localStorage.removeItem(activeJobKey);
  return { assetId: result.assetId, status: "ready" };
}

function uploadToApi(files: File[], onProgress: (sent: number, total: number) => void, signal: AbortSignal, onJob?: (jobId: string) => void): Promise<UploadResult> {
  const form = new FormData();
  for (const file of files) form.append("file", file, file.name);
  form.set("relativePath", JSON.stringify(files.map(relativePath)));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = () => signal.removeEventListener("abort", abort);
    xhr.open("POST", "/api/assets/import/jobs");
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    });
    xhr.onload = () => {
      finish();
      let data: { jobId?: string; phase?: string; code?: string; message?: string } = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* An empty or invalid response is an import failure. */ }
      if (xhr.status < 200 || xhr.status >= 300 || !data.jobId) {
        reject(Object.assign(new Error(data.message ?? "Import failed"), { code: data.code ?? "IMPORT_FAILED" }));
      } else {
        localStorage.setItem(activeJobKey, data.jobId);
        onJob?.(data.jobId);
        void runJob(data.jobId).then(resolve, reject);
      }
    };
    xhr.onerror = () => { finish(); reject(new Error("Upload connection failed")); };
    xhr.onabort = () => { finish(); reject(new DOMException("Upload cancelled", "AbortError")); };
    if (signal.aborted) return reject(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(form);
  });
}

function relativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

export function ImportDropzone({ upload = uploadToApi }: { upload?: Upload }) {
  const router = useRouter();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<"empty" | "ready" | "uploading" | "processing" | "complete" | "error">("empty");
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<JobStatus | null>(null);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
    if (upload !== uploadToApi) return;
    const saved = localStorage.getItem(activeJobKey);
    if (!saved) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setJobId(saved);
      setPhase("processing");
      void runJob(saved).then((result) => {
        if (!active) return;
        setAssetId(result.assetId);
        setPhase("complete");
        router.refresh();
      }).catch((reason: unknown) => {
        if (!active) return;
        const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "IMPORT_FAILED";
        setError(errorMessages[code] ?? errorMessages.IMPORT_FAILED);
        setPhase("error");
      });
    });
    return () => { active = false; };
  }, [router, upload]);

  useEffect(() => {
    if (phase !== "processing" || !jobId || upload !== uploadToApi) return;
    let active = true;
    const update = () => {
      void jobRequest(`/api/assets/import/jobs/${encodeURIComponent(jobId)}`).then((status) => {
        if (active) setProcessingProgress(status);
      }).catch(() => {});
    };
    update();
    const timer = setInterval(update, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [jobId, phase, upload]);

  function select(next: File[]) {
    setFiles(next);
    setPhase(next.length ? "ready" : "empty");
    setError(null);
    setProgress(null);
    setAssetId(null);
    setJobId(null);
    setProcessingProgress(null);
  }

  async function submit() {
    if (!files.length || phase === "uploading" || phase === "processing") return;
    setPhase("uploading");
    setError(null);
    setProgress(null);
    controller.current = new AbortController();
    try {
      const result = await upload(files, (sent, total) => {
        setProgress({ sent, total });
        if (total && sent >= total) setPhase("processing");
      }, controller.current.signal, setJobId);
      setJobId(null);
      setAssetId(result.assetId);
      setPhase("complete");
      router.refresh();
    } catch (reason) {
      const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "IMPORT_FAILED";
      const detail = reason && typeof reason === "object" && "message" in reason && typeof reason.message === "string" ? reason.message : null;
      setError(reason instanceof DOMException && reason.name === "AbortError" ? "Upload cancelled." : code === "MISSING_DEPENDENCY" && detail ? detail : errorMessages[code] ?? errorMessages.IMPORT_FAILED);
      setPhase("error");
    } finally {
      controller.current = null;
    }
  }

  async function cancelProcessing() {
    const current = jobId ?? localStorage.getItem(activeJobKey);
    if (!current) return;
    try {
      await jobRequest(`/api/assets/import/jobs/${encodeURIComponent(current)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      setError("Cancelling import…");
    } catch {
      setError("Could not cancel this import. Try again.");
    }
  }

  async function retryJob() {
    const current = jobId ?? localStorage.getItem(activeJobKey);
    if (!current) return submit();
    try {
      await jobRequest(`/api/assets/import/jobs/${encodeURIComponent(current)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry" }) });
      setError(null);
      setPhase("processing");
      const result = await runJob(current);
      setAssetId(result.assetId);
      setJobId(null);
      setPhase("complete");
      router.refresh();
    } catch (reason) {
      const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "IMPORT_FAILED";
      setError(errorMessages[code] ?? errorMessages.IMPORT_FAILED);
      setPhase("error");
    }
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return (
    <section className="import-panel" aria-labelledby="import-title">
      <div className="import-heading">
        <div>
          <p className="section-kicker">Add to library</p>
          <h2 id="import-title">Bring a model in.</h2>
          <p>Keep the model, its textures, and embedded animations together. Yggdrasil will inspect the package without changing your original files.</p>
        </div>
        <span className="import-step-mark" aria-hidden="true">01 / 08</span>
      </div>

      <div className="drop-surface" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (phase !== "uploading" && phase !== "processing") select(Array.from(event.dataTransfer.files)); }}>
        <button type="button" className="drop-trigger" onClick={() => filesInput.current?.click()} disabled={phase === "uploading" || phase === "processing"}>
          <UploadCloud aria-hidden="true" size={30} strokeWidth={1.5} />
          <strong>Drop model files here</strong>
          <span>or use one of the choices below</span>
        </button>
      </div>

      <div className="import-choices">
        <label className="file-choice">
          <Layers3 size={19} aria-hidden="true" />
          <span>Choose model files</span>
          <input ref={filesInput} type="file" multiple accept=".gltf,.glb,.fbx,.obj,.mtl,.bin,.png,.jpg,.jpeg,.webp,.ktx2,.txt,.md" disabled={phase === "uploading" || phase === "processing"} onChange={(event) => select(Array.from(event.target.files ?? []))} />
        </label>
        <label className="file-choice">
          <FolderOpen size={19} aria-hidden="true" />
          <span>Choose folder</span>
          <input ref={folderInput} type="file" multiple disabled={phase === "uploading" || phase === "processing"} onChange={(event) => select(Array.from(event.target.files ?? []))} />
        </label>
        <label className="file-choice">
          <FileArchive size={19} aria-hidden="true" />
          <span>Choose ZIP</span>
          <input type="file" accept=".zip" disabled={phase === "uploading" || phase === "processing"} onChange={(event) => select(Array.from(event.target.files ?? []))} />
        </label>
      </div>

      <div className="import-footer">
        <div className="import-selection" aria-live="polite">
          {phase === "empty" ? <span>Choose a model, folder, or ZIP to begin.</span> : null}
          {phase === "ready" ? <span>{files.length} {files.length === 1 ? "file" : "files"} ready · {(totalBytes / 1024 / 1024).toFixed(1)} MB</span> : null}
          {phase === "uploading" ? <span>{progress ? `Uploading ${(progress.sent / 1024 / 1024).toFixed(1)} of ${(progress.total / 1024 / 1024).toFixed(1)} MB…` : "Uploading your model…"}</span> : null}
          {phase === "processing" ? <span>{processingProgress ? `${processingProgress.phase === "staging" ? "Saving files" : processingProgress.phase === "committing" ? "Finishing import" : "Analyzing model"} · ${((processingProgress.processedBytes ?? 0) / 1024 / 1024).toFixed(1)} of ${((processingProgress.totalBytes ?? 0) / 1024 / 1024).toFixed(1)} MB` : "Analyzing your model…"}</span> : null}
          {phase === "complete" ? <span className="success-message">Import complete</span> : null}
          {phase === "error" ? <span role="alert">{error}</span> : null}
        </div>
        {phase === "uploading" ? <button type="button" onClick={() => controller.current?.abort()}>Cancel upload</button> : null}
        {phase === "processing" && upload === uploadToApi ? <button type="button" onClick={cancelProcessing}>Cancel import</button> : null}
        {phase === "error" && jobId && upload === uploadToApi ? <button type="button" onClick={retryJob}>Retry saved import</button> : null}
        <button type="button" className="primary-button" disabled={!files.length || phase === "uploading" || phase === "processing"} onClick={submit}>
          {phase === "uploading" || phase === "processing" ? "Importing…" : "Import asset"}
          {phase === "uploading" || phase === "processing" ? null : <ArrowUpRight size={17} aria-hidden="true" />}
        </button>
      </div>
      {assetId && phase === "complete" ? <a className="import-view-link" href={`/assets/${encodeURIComponent(assetId)}`}>Open asset report <ArrowUpRight size={16} aria-hidden="true" /></a> : null}
    </section>
  );
}
