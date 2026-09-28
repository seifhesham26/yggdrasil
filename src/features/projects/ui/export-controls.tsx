"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProjectSnapshot } from "../domain/project-state";

type ExportJobView = { id: string; projectRevision: number; status: "queued" | "building" | "ready" | "failed"; errorCode: string | null; target: string; createdAt: string; manifest: { warnings: string[] } | null };

export function ExportControls({ projectId, dirty, snapshot, onChange, availablePaths }: { projectId: string; dirty: boolean; snapshot: ProjectSnapshot; onChange: (snapshot: ProjectSnapshot) => void; availablePaths: string[] }) {
  const selectablePaths = [...new Set([...availablePaths, ...snapshot.export.criticalAssetIds])];
  const [jobs, setJobs] = useState<ExportJobView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/api/projects/${projectId}/exports`;
  const refresh = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load exports (${response.status}).`);
    setJobs((await response.json() as { jobs: ExportJobView[] }).jobs);
  }, [endpoint]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error(`Could not load exports (${response.status}).`);
      return response.json() as Promise<{ jobs: ExportJobView[] }>;
    }).then((result) => setJobs(result.jobs)).catch((issue) => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Could not load exports."); });
    return () => controller.abort();
  }, [endpoint]);

  async function action(url: string, body?: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error(`Export request failed (${response.status}).`);
      await refresh();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Export request failed."); }
    finally { setBusy(false); }
  }

  return <div className="export-controls">
    <p>Create a validated manifest from the saved project revision. The original model and private animation sources remain in protected storage.</p>
    <label>Loading policy <select aria-label="Loading policy" value={snapshot.export.loadingPolicy} onChange={(event) => onChange({ ...snapshot, export: { ...snapshot.export, loadingPolicy: event.target.value as ProjectSnapshot["export"]["loadingPolicy"] } })}>
      <option value="on-demand">On demand</option><option value="metadata-first">Metadata first</option><option value="critical-assets">Critical assets first</option><option value="full-preload">Full preload</option>
    </select></label>
    {snapshot.export.loadingPolicy === "critical-assets" || snapshot.export.criticalAssetIds.some((path) => !availablePaths.includes(path)) ? <fieldset><legend>Critical files</legend>{selectablePaths.map((path) => <label key={path}><input type="checkbox" checked={snapshot.export.criticalAssetIds.includes(path)} onChange={(event) => onChange({ ...snapshot, export: { ...snapshot.export, criticalAssetIds: event.target.checked ? [...snapshot.export.criticalAssetIds, path] : snapshot.export.criticalAssetIds.filter((item) => item !== path) } })} />{availablePaths.includes(path) ? path : `Unavailable: ${path}`}</label>)}</fieldset> : null}
    {dirty ? <p role="status">Save the project before exporting.</p> : null}
    <button type="button" disabled={dirty || busy} onClick={() => void action(endpoint, { target: "manifest" })}>Create export manifest</button>
    <button type="button" disabled={dirty || busy} onClick={() => void action(endpoint, { target: "react" })}>Export React component</button>
    <button type="button" disabled={dirty || busy} onClick={() => void action(endpoint, { target: "embed" })}>Export embed viewer</button>
    <button type="button" disabled={dirty || busy} onClick={() => void action(endpoint, { target: "package" })}>Download complete package</button>
    <button type="button" disabled={busy} onClick={() => void refresh().catch((issue) => setError(issue instanceof Error ? issue.message : "Could not load exports."))}>Refresh exports</button>
    {error ? <p role="alert">{error}</p> : null}
    <ul aria-label="Export jobs">{jobs.map((job) => <li key={job.id}>
      <strong>Revision {job.projectRevision} · {job.target}</strong><span>{job.status}{job.errorCode ? ` · ${job.errorCode}` : ""}</span>
      {job.status === "ready" ? <a href={`${endpoint}/${job.id}/${job.target === "manifest" ? "manifest" : "artifact"}`}>Download {job.target === "manifest" ? "manifest" : job.target === "react" ? "React package" : job.target === "embed" ? "embed package" : "complete package"}</a> : null}
      {job.status === "failed" ? <button type="button" disabled={busy} onClick={() => void action(`${endpoint}/${job.id}/retry`)}>Retry export</button> : null}
      {job.manifest?.warnings.map((warning) => <p key={warning} role="status">{warning}</p>)}
    </li>)}</ul>
  </div>;
}
