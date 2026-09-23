"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, FileArchive, FolderOpen, Layers3, UploadCloud } from "lucide-react";
import type { ImportFile } from "../domain/types";

type UploadResult = { assetId: string; status: string };
type Upload = (entries: ImportFile[]) => Promise<UploadResult>;

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
};

async function uploadToApi(entries: ImportFile[]): Promise<UploadResult> {
  const form = new FormData();
  for (const entry of entries) {
    const filename = entry.relativePath.split("/").at(-1) ?? "model";
    form.append("file", new File([Uint8Array.from(entry.bytes)], filename));
  }
  form.set("relativePath", JSON.stringify(entries.map((entry) => entry.relativePath)));
  const response = await fetch("/api/assets/import", { method: "POST", body: form });
  const data: unknown = await response.json();
  if (!response.ok) {
    const failure = data && typeof data === "object" ? data as { code?: string; candidates?: string[] } : {};
    throw Object.assign(new Error("Import failed"), { code: failure.code ?? "IMPORT_FAILED", candidates: failure.candidates });
  }
  return data as UploadResult;
}

function relativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

export function ImportDropzone({ upload = uploadToApi }: { upload?: Upload }) {
  const router = useRouter();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<"empty" | "ready" | "uploading" | "complete" | "error">("empty");
  const [error, setError] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  function select(next: File[]) {
    setFiles(next);
    setPhase(next.length ? "ready" : "empty");
    setError(null);
    setAssetId(null);
  }

  async function submit() {
    if (!files.length || phase === "uploading") return;
    setPhase("uploading");
    setError(null);
    try {
      const entries = await Promise.all(files.map(async (file) => ({ relativePath: relativePath(file), bytes: new Uint8Array(await file.arrayBuffer()) })));
      const result = await upload(entries);
      setAssetId(result.assetId);
      setPhase("complete");
      router.refresh();
    } catch (reason) {
      const code = reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "IMPORT_FAILED";
      const detail = reason && typeof reason === "object" && "message" in reason && typeof reason.message === "string" ? reason.message : null;
      setError(code === "MISSING_DEPENDENCY" && detail ? detail : errorMessages[code] ?? errorMessages.IMPORT_FAILED);
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

      <div className="drop-surface" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (phase !== "uploading") select(Array.from(event.dataTransfer.files)); }}>
        <button type="button" className="drop-trigger" onClick={() => filesInput.current?.click()} disabled={phase === "uploading"}>
          <UploadCloud aria-hidden="true" size={30} strokeWidth={1.5} />
          <strong>Drop model files here</strong>
          <span>or use one of the choices below</span>
        </button>
      </div>

      <div className="import-choices">
        <label className="file-choice">
          <Layers3 size={19} aria-hidden="true" />
          <span>Choose model files</span>
          <input ref={filesInput} type="file" multiple accept=".gltf,.glb,.fbx,.obj,.mtl,.bin,.png,.jpg,.jpeg,.webp,.ktx2,.txt,.md" disabled={phase === "uploading"} onChange={(event) => select(Array.from(event.target.files ?? []))} />
        </label>
        <label className="file-choice">
          <FolderOpen size={19} aria-hidden="true" />
          <span>Choose folder</span>
          <input ref={folderInput} type="file" multiple disabled={phase === "uploading"} onChange={(event) => select(Array.from(event.target.files ?? []))} />
        </label>
        <label className="file-choice">
          <FileArchive size={19} aria-hidden="true" />
          <span>Choose ZIP</span>
          <input type="file" accept=".zip" disabled={phase === "uploading"} onChange={(event) => select(Array.from(event.target.files ?? []))} />
        </label>
      </div>

      <div className="import-footer">
        <div className="import-selection" aria-live="polite">
          {phase === "empty" ? <span>Choose a model, folder, or ZIP to begin.</span> : null}
          {phase === "ready" ? <span>{files.length} {files.length === 1 ? "file" : "files"} ready · {(totalBytes / 1024 / 1024).toFixed(1)} MB</span> : null}
          {phase === "uploading" ? <span>Uploading and analyzing your model…</span> : null}
          {phase === "complete" ? <span className="success-message">Import complete</span> : null}
          {phase === "error" ? <span role="alert">{error}</span> : null}
        </div>
        <button type="button" className="primary-button" disabled={!files.length || phase === "uploading"} onClick={submit}>
          {phase === "uploading" ? "Importing…" : "Import asset"}
          {phase === "uploading" ? null : <ArrowUpRight size={17} aria-hidden="true" />}
        </button>
      </div>
      {assetId && phase === "complete" ? <a className="import-view-link" href={`/assets/${encodeURIComponent(assetId)}`}>Open asset report <ArrowUpRight size={16} aria-hidden="true" /></a> : null}
    </section>
  );
}
