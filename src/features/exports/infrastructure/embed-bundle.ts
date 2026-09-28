import { join } from "node:path";
import { build } from "esbuild";
import { zipSync } from "fflate";
import type { AssetStorage } from "@/lib/storage/types";
import { safePortablePath, type ExportManifest, type ResolvedExportFile } from "../domain/export-manifest";
import { assetEntries } from "./react-bundle";

const encoder = new TextEncoder();

export async function embedBundleEntries(manifest: ExportManifest, files: ResolvedExportFile[], storage: Pick<AssetStorage, "read">): Promise<Record<string, Uint8Array>> {
  const result = await build({ entryPoints: [join(process.cwd(), "src/features/exports/runtime/embed-entry.tsx")], bundle: true, platform: "browser", format: "esm", target: "es2022", minify: true, write: false, outfile: "viewer.js", alias: { "@/features/projects/domain/project-state": join(process.cwd(), "src/features/projects/domain/project-state.ts") } });
  const viewer = result.outputFiles?.[0]?.contents;
  if (!viewer) throw new Error("Embed runtime was not built.");
  const entries: Record<string, Uint8Array> = {
    "viewer.js": viewer,
    "manifest.json": encoder.encode(JSON.stringify(manifest, null, 2) + "\n"),
    "viewer.html": encoder.encode('<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Yggdrasil viewer</title><style>html,body,#viewer{width:100%;height:100%;margin:0;overflow:hidden}</style></head><body><div id="viewer"></div><script type="module">import { mountYggdrasilViewer } from "./viewer.js"; const base = new URL("./", location.href); mountYggdrasilViewer(document.getElementById("viewer"), { manifestUrl: new URL("manifest.json", base).href, assetBaseUrl: base.href, hostOrigin: new URL(location.href).searchParams.get("origin") || undefined });</script></body></html>\n'),
    "host.html": encoder.encode('<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Yggdrasil embed sample</title><style>iframe{width:100%;height:70vh;border:0}</style></head><body><h1>Embedded model</h1><iframe id="model" title="Interactive 3D model" loading="lazy"></iframe><p id="status" role="status">Loading viewer…</p><script>const frame=document.getElementById("model");const url=new URL("viewer.html",location.href);url.searchParams.set("origin",location.origin);frame.src=url.href;addEventListener("message",event=>{if(event.origin!==url.origin||event.source!==frame.contentWindow||event.data?.channel!=="yggdrasil-viewer")return;if(["loaded","progress","error","interaction"].includes(event.data.type))document.getElementById("status").textContent=event.data.type;});</script></body></html>\n'),
    "README.md": encoder.encode(`# ${manifest.projectName} — embed export\n\nServe this folder over HTTP(S); open host.html for the iframe example. For another site, embed viewer.html in an iframe with a descriptive title and append ?origin=<encoded host origin> to receive events. The host must verify event.origin and event.source and accept only channel yggdrasil-viewer with loaded, progress, error, or interaction types. No incoming command or script channel exists. Cross-origin hosting requires the exported files to be served together at one origin; the host site does not need CORS because the viewer runs inside its iframe. For same-page use, import mountYggdrasilViewer from viewer.js, pass the manifest URL and asset base URL, then call destroy() on teardown. The viewer responds to container resize, reduced-motion preferences, and keyboard hotspot buttons.\n\nAttribution:\n${manifest.attribution.length ? manifest.attribution.map((entry) => `${entry.path}: ${entry.text}`).join("\n") : manifest.warnings.join("\n")}\n`),
  };
  Object.assign(entries, await assetEntries(files, storage, ""));
  for (const path of Object.keys(entries)) if (!safePortablePath(path)) throw new Error("Unsafe embed path.");
  return entries;
}

export async function buildEmbedBundle(manifest: ExportManifest, files: ResolvedExportFile[], storage: Pick<AssetStorage, "read">): Promise<Uint8Array> {
  return zipSync(await embedBundleEntries(manifest, files, storage), { level: 6 });
}
