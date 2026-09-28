import { createRoot } from "react-dom/client";
import { YggdrasilModel, type YggdrasilConfig } from "./YggdrasilModel";

export type EmbedEvent = { type: "loaded" } | { type: "progress"; loaded: number; total: number } | { type: "error"; code: "MANIFEST_LOAD_FAILED" | "MODEL_LOAD_FAILED" } | { type: "interaction"; id: string; action: string };
export type EmbedOptions = { manifestUrl: string; assetBaseUrl: string; hostOrigin?: string; onEvent?: (event: EmbedEvent) => void };

/** The only host channel sends fixed, serializable events to one explicit origin. */
export function mountYggdrasilViewer(element: HTMLElement, options: EmbedOptions) {
  let origin: string | null = null;
  if (options.hostOrigin) {
    const parsed = new URL(options.hostOrigin);
    if (parsed.origin !== options.hostOrigin || !["http:", "https:"].includes(parsed.protocol)) throw new Error("hostOrigin must be one HTTP(S) origin.");
    origin = parsed.origin;
  }
  const controller = new AbortController();
  const root = createRoot(element);
  let destroyed = false;
  const emit = (event: EmbedEvent) => {
    if (destroyed) return;
    options.onEvent?.(event);
    if (origin && window.parent !== window) window.parent.postMessage({ channel: "yggdrasil-viewer", ...event }, origin);
  };
  void fetch(options.manifestUrl, { signal: controller.signal }).then(async (response) => {
    if (!response.ok) throw new Error("Manifest unavailable.");
    const manifest: unknown = await response.json();
    if (!manifest || typeof manifest !== "object" || (manifest as { formatVersion?: unknown }).formatVersion !== 1 || typeof (manifest as { modelPath?: unknown }).modelPath !== "string") throw new Error("Invalid manifest.");
    if (destroyed) return;
    root.render(<YggdrasilModel manifest={manifest as YggdrasilConfig} assetBaseUrl={options.assetBaseUrl} onLoad={() => emit({ type: "loaded" })} onError={() => emit({ type: "error", code: "MODEL_LOAD_FAILED" })} onProgress={(loaded, total) => emit({ type: "progress", loaded, total })} onInteraction={(id, action) => emit({ type: "interaction", id, action })} />);
  }).catch((error) => { if (!destroyed && !(error instanceof DOMException && error.name === "AbortError")) { element.textContent = "Viewer unavailable."; emit({ type: "error", code: "MANIFEST_LOAD_FAILED" }); } });
  return { destroy() { if (destroyed) return; destroyed = true; controller.abort(); root.unmount(); } };
}
