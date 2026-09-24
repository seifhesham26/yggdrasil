"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VariantControls({ assetId, candidates, currentModelPath, attributionFiles, attribution }: {
  assetId: string;
  candidates: string[];
  currentModelPath: string | null;
  attributionFiles: Array<{ relativePath: string; storageKey: string }>;
  attribution: "present" | "unknown";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function select(selectedModelPath: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/assets/${assetId}/variant`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedModelPath }),
      });
      if (!response.ok) {
        const result = await response.json() as { message?: string };
        throw new Error(result.message ?? "The variant could not be selected.");
      }
      setMessage("Preview switched. Original source files remain unchanged.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The variant could not be selected.");
    } finally { setBusy(false); }
  }

  return <section className="asset-info-section variant-controls" aria-labelledby="variant-controls-title" aria-busy={busy}>
    <h2 id="variant-controls-title">Source variants</h2>
    <p>Choose a retained model to make a new preview version. Source files stay unchanged.</p>
    <ul>{candidates.map((path) => <li key={path}>
      <span>{path}{path === currentModelPath ? <strong> Current preview</strong> : null}</span>
      <button type="button" onClick={() => select(path)} disabled={busy || path === currentModelPath}>Use {path}</button>
    </li>)}</ul>
    <h3>Attribution</h3>
    <p>Attribution {attribution === "present" ? "provided, not verified" : "unknown"}. Check the source terms before redistribution.</p>
    {attributionFiles.length ? <ul>{attributionFiles.map((file) => <li key={file.storageKey}><a href={`/api/assets/${assetId}/file?key=${encodeURIComponent(file.storageKey)}`} download>{file.relativePath}</a></li>)}</ul> : <p>No license or credit file was supplied.</p>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
