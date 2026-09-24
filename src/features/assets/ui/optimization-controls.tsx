"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ModelCanvasLoader } from "@/features/viewer/model-canvas-loader";
import type { ViewerFile } from "@/features/viewer/model-canvas";
import type { OptimizationReport } from "../domain/optimization";
import type { OptimizationOperation } from "../domain/optimization";
import type { OptimizationSettings, OptimizationVersion, OptimizationAttempt } from "../application/reversible-optimization";

type History = { versions: OptimizationVersion[]; attempts: OptimizationAttempt[]; currentVersionId?: string; report: OptimizationReport };

async function readResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

export function OptimizationControls({ assetId, sourceFiles = [] }: { assetId: string; sourceFiles?: ViewerFile[] }) {
  const router = useRouter();
  const [history, setHistory] = useState<History | null>(null);
  const [compareId, setCompareId] = useState("");
  const [selectedOperation, setSelectedOperation] = useState<OptimizationOperation>("normalize");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const endpoint = `/api/assets/${assetId}/optimization`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${endpoint}?view=history`, { signal: controller.signal }).then(readResponse).then((data: History) => {
      if (!controller.signal.aborted) setHistory(data);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "History could not be loaded.");
    });
    return () => controller.abort();
  }, [endpoint]);

  async function refresh() {
    const data: History = await readResponse(await fetch(`${endpoint}?view=history`));
    setHistory(data);
  }

  async function mutate(method: "POST" | "PATCH", body: object, success: string) {
    setBusy(true); setMessage(null);
    try {
      await readResponse(await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
      await refresh();
      router.refresh();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The request could not be completed.");
      // Reload even a failed operation so its durable attempt can be retried.
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const current = history?.versions.find((version) => version.id === history.currentVersionId);
  const compare = history?.versions.find((version) => version.id === compareId);
  const recommendations = history?.report.findings.filter((finding) => finding.supported) ?? [];
  const recommendation = history?.report.findings.find((finding) => finding.operation === selectedOperation);
  const operationSettings: OptimizationSettings = selectedOperation === "resize-textures"
    ? { keepExtras: true, maxTextureSize: 2048, targetFormat: "png" }
    : selectedOperation === "compress-geometry"
      ? { keepExtras: true, meshoptLevel: "medium" }
      : selectedOperation === "lower-detail" ? { keepExtras: true, detailRatio: 0.5, detailError: 0.01 } : { keepExtras: true };
  const operationLabel = selectedOperation === "normalize" ? "normalization" : selectedOperation.replaceAll("-", " ");
  const failed = history?.attempts.filter((attempt) => attempt.status === "failed").findLast((attempt) => !history.attempts.some((retry) => retry.retryOf === attempt.id && retry.status === "succeeded"));
  const compareFile = compare?.operation === "original" ? sourceFiles.find((file) => file.storageKey === compare.storageKey) : compare ? { relativePath: compare.operation === "variant" && compare.storageKey.endsWith(".gltf") ? compare.storageKey.split("/variants/").at(-1)?.split("/").slice(1).join("/") ?? "model.gltf" : "model.glb", storageKey: compare.storageKey } : undefined;
  const metrics = current && compare ? [
    ["Model bytes", current.byteSize, compare.byteSize],
    ["Triangles", current.analysis.counts.triangles, compare.analysis.counts.triangles],
    ["Materials", current.analysis.counts.materials, compare.analysis.counts.materials],
    ["Textures", current.analysis.counts.textures, compare.analysis.counts.textures],
    ["Animations", current.analysis.counts.animations, compare.analysis.counts.animations],
  ] as const : [];

  return <section className="optimization-controls asset-info-section" aria-labelledby="optimization-controls-title" aria-busy={busy}>
    <h2 id="optimization-controls-title">Reversible optimization</h2>
    <p>Derived files are private, measured, and never replace the source upload.</p>
    {recommendation ? <div>
      <p>{recommendation.evidence} Quality risk: {recommendation.qualityRisk}. Estimated savings: {recommendation.estimatedGain.percent ?? 0}% (not measured).</p>
      {recommendation.warning ? <p>{recommendation.warning}</p> : null}
      <p>Approving creates and selects a new version. Review the resulting preview before using it.</p>
    </div> : <p>{history ? "No compatible optimization is available for this version." : "Loading compatibility and history…"}</p>}
    {history && recommendations.length ? <label>Operation
      <select aria-label="Optimization operation" value={selectedOperation} onChange={(event) => setSelectedOperation(event.target.value as OptimizationOperation)}>
        {recommendations.map((finding) => <option key={finding.operation} value={finding.operation}>{finding.operation.replaceAll("-", " ")}</option>)}
      </select>
    </label> : null}
    <button type="button" onClick={() => mutate("POST", { operation: selectedOperation, approve: true, settings: operationSettings }, `Applied ${operationLabel} as a new version.`)} disabled={busy || !recommendation?.supported}>Approve {operationLabel}</button>
    {message ? <p role="status">{message}</p> : null}
    {failed ? <button type="button" onClick={() => mutate("POST", { action: "retry" }, "Retry completed.")} disabled={busy}>Retry last failed operation</button> : null}
    {history ? <>
      <ol aria-label="Optimization version history">{history.versions.map((version) => <li key={version.id} aria-current={version.id === history.currentVersionId ? "true" : undefined}>
        <span>{version.operation} · {version.byteSize.toLocaleString()} bytes</span>{version.id === history.currentVersionId ? <strong> Current version</strong> : null}
        <button type="button" onClick={() => mutate("PATCH", { action: "revert", versionId: version.id }, "Current version changed; later history was preserved.")} disabled={busy || version.id === history.currentVersionId}>Use this version</button>
      </li>)}</ol>
      <label>Compare with <select value={compareId} onChange={(event) => setCompareId(event.target.value)}>
        <option value="">Choose a retained version</option>
        {history.versions.filter((version) => version.id !== history.currentVersionId).map((version, index) => <option key={version.id} value={version.id}>{version.operation} — version {index + 1}</option>)}
      </select></label>
      {current && compare && compare.id !== current.id ? <div className="version-comparison">
        <table aria-label="Version comparison"><thead><tr><th>Measured metric</th><th>Current: {current.operation}</th><th>Compare: {compare.operation}</th></tr></thead><tbody>
          {metrics.map(([name, value, compared]) => <tr key={name}><th>{name}</th><td>{value.toLocaleString()}</td><td>{compared.toLocaleString()}</td></tr>)}
        </tbody></table>
        <p>The report preview shows the current version. Comparison preview: {compare.operation}.</p>
        {compareFile ? <section aria-label="Comparison preview"><ModelCanvasLoader key={compare.id} modelUrl={`/api/assets/${assetId}/file?key=${encodeURIComponent(compare.storageKey)}`} primaryRelativePath={compareFile.relativePath} files={compare.operation === "original" || compare.operation === "variant" ? sourceFiles : [compareFile]} /></section> : null}
      </div> : null}
      {history.attempts.length ? <ol aria-label="Optimization operation history">{history.attempts.map((attempt) => <li key={attempt.id}>{attempt.operation}: {attempt.status}{attempt.retryOf ? " (retry)" : ""}{attempt.error ? ` — ${attempt.error}` : ""}</li>)}</ol> : null}
    </> : null}
  </section>;
}
