import { zipSync } from "fflate";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetStorage } from "@/lib/storage/types";
import { safePortablePath, type ExportManifest, type ResolvedExportFile } from "../domain/export-manifest";
import { reactBundleEntries } from "./react-bundle";
import { embedBundleEntries } from "./embed-bundle";

const encode = (value: string) => new TextEncoder().encode(value);

export async function buildPackageBundle(manifest: ExportManifest, files: ResolvedExportFile[], storage: Pick<AssetStorage, "read">): Promise<Uint8Array> {
  const [react, embed] = await Promise.all([reactBundleEntries(manifest, files, storage), embedBundleEntries(manifest, files, storage)]);
  const dependencies = JSON.parse(new TextDecoder().decode(react["package.json"])) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  const licenses = await Promise.all(Object.keys({ ...dependencies.dependencies, ...dependencies.devDependencies }).map(async (name) => {
    try {
      const packageJson = JSON.parse(await readFile(join(process.cwd(), "node_modules", name, "package.json"), "utf8")) as { name: string; version: string; license?: string };
      return { name: packageJson.name, version: packageJson.version, license: packageJson.license ?? "See installed package" };
    } catch { return { name, version: dependencies.dependencies[name] ?? dependencies.devDependencies[name], license: "Check after installation" }; }
  }));
  const entries: Record<string, Uint8Array> = {
    "manifest.json": encode(JSON.stringify(manifest, null, 2) + "\n"),
    "README.md": encode(`# ${manifest.projectName} — downloadable package\n\nThis frozen revision contains two independent examples. Serve embed/ over HTTP(S) and open embed/host.html, or run pnpm install and pnpm dev in react/. No Yggdrasil server or database is needed. See each folder's README for integration details.\n\nLoading policy: ${manifest.config.export.loadingPolicy}. Critical files: ${manifest.config.export.criticalAssetIds.join(", ") || "none"}. The viewer reports loading progress, lets visitors retry errors, and waits for a click with on-demand loading. Opening animations start after the model is ready.\n\nAttribution and redistribution terms: see attribution.txt and the supplied asset files.\n`),
    "attribution.txt": encode(manifest.attribution.length ? manifest.attribution.map((item) => `${item.path}: ${item.text}`).join("\n\n") + "\n" : manifest.warnings.join("\n") + "\n"),
    "dependencies.json": react["package.json"],
    "licenses.json": encode(JSON.stringify({ directDependencies: licenses, assetTerms: "See attribution.txt and supplied asset files." }, null, 2) + "\n"),
  };
  for (const [path, bytes] of Object.entries(react)) entries[`react/${path}`] = bytes;
  for (const [path, bytes] of Object.entries(embed)) entries[`embed/${path}`] = bytes;
  const required = ["README.md", "manifest.json", "dependencies.json", "licenses.json", "attribution.txt", "react/src/YggdrasilModel.tsx", "react/src/main.tsx", "react/package.json", "embed/viewer.js", "embed/viewer.html", "embed/host.html", ...manifest.files.flatMap((file) => [`react/public/${file.path}`, `embed/${file.path}`])];
  const paths = Object.keys(entries);
  if (required.some((path) => !entries[path] || !safePortablePath(path)) || paths.some((path) => !safePortablePath(path)) || new Set(paths.map((path) => path.toLowerCase())).size !== paths.length) throw new Error("Package is incomplete or has an unsafe path.");
  // ponytail: The in-memory ZIP doubles assets for two ready-to-run examples; stream when exports become multi-gigabyte.
  return zipSync(entries, { level: 6 });
}
