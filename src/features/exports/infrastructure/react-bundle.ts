import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";
import type { AssetStorage } from "@/lib/storage/types";
import { safePortablePath, type ExportManifest, type ResolvedExportFile } from "../domain/export-manifest";

const encoder = new TextEncoder();
const source = (path: string) => readFile(join(process.cwd(), "src", "features", "exports", "runtime", path), "utf8");
const projectState = () => readFile(join(process.cwd(), "src", "features", "projects", "domain", "project-state.ts"), "utf8");

export async function assetEntries(files: ResolvedExportFile[], storage: Pick<AssetStorage, "read">, prefix: string): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    if (!safePortablePath(file.path)) throw new Error("Unsafe output path.");
    const bytes = await storage.read(file.storageKey);
    if (bytes.byteLength !== file.byteSize || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error(`Export source ${file.path} is missing or changed.`);
    entries[`${prefix}${file.path}`] = bytes;
  }
  return entries;
}

export async function reactBundleEntries(manifest: ExportManifest, files: ResolvedExportFile[], storage: Pick<AssetStorage, "read">): Promise<Record<string, Uint8Array>> {
  const packageJson = {
    name: "yggdrasil-export", version: "1.0.0", private: true, type: "module",
    scripts: { dev: "vite --host 127.0.0.1", build: "tsc --noEmit && vite build" },
    dependencies: { react: "19.3.0", "react-dom": "19.3.0", three: "0.186.0", gsap: "3.15.0", zod: "4.6.5" },
    devDependencies: { "@types/react": "19.3.0", "@types/react-dom": "19.3.0", "@types/three": "0.186.0", typescript: "5.9.3", vite: "8.3.0" },
  };
  const readme = `# ${manifest.projectName} — React export\n\nThis package contains the frozen project revision ${manifest.projectRevision} and its retained model files. No Yggdrasil server is needed.\n\nRun \`pnpm install\` and \`pnpm dev\` to open the independent sample, or import \`YggdrasilModel\` from \`src/YggdrasilModel.tsx\` and \`manifest\` from \`src/manifest.json\` into a React 19 site. Place the \`assets\` directory at the site's public root and pass \`assetBaseUrl\` if it is served elsewhere. Give the component's parent an explicit height.\n\nThe component accepts \`onLoad\`, \`onError\`, \`onProgress\`, and \`onInteraction\` hooks. It applies scene and appearance settings, safe interactions, embedded/imported clips, sequences, timelines, and reduced motion. The browser resolves every asset relative to the deployment URL.\n\n## Attribution\n${manifest.attribution.length ? manifest.attribution.map((entry) => `- ${entry.path}: ${entry.text}`).join("\n") : manifest.warnings.join("\n")}\n\nDependencies: React 19.3.0, React DOM 19.3.0, Three.js 0.186.0, GSAP 3.15.0, Zod 4.6.5.\n`;
  const entries: Record<string, Uint8Array> = {
    "package.json": encoder.encode(JSON.stringify(packageJson, null, 2) + "\n"),
    "tsconfig.json": encoder.encode(JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, skipLibCheck: true, resolveJsonModule: true, noEmit: true, lib: ["ES2022", "DOM"] }, include: ["src"] }, null, 2) + "\n"),
    "index.html": encoder.encode('<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Yggdrasil export</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n'),
    "README.md": encoder.encode(readme),
    "src/manifest.json": encoder.encode(JSON.stringify(manifest, null, 2) + "\n"),
    "src/project-state.ts": encoder.encode(await projectState()),
    "src/YggdrasilModel.tsx": encoder.encode((await source("YggdrasilModel.tsx")).replace('from "@/features/projects/domain/project-state"', 'from "./project-state"')),
    "src/main.tsx": encoder.encode('import { createRoot } from "react-dom/client";\nimport { YggdrasilModel, type YggdrasilConfig } from "./YggdrasilModel";\nimport manifest from "./manifest.json";\nconst root = document.getElementById("root")!;\ncreateRoot(root).render(<main style={{ height: "100vh", margin: 0 }}><YggdrasilModel manifest={manifest as unknown as YggdrasilConfig} assetBaseUrl={window.location.origin + "/"} onLoad={() => root.setAttribute("data-loaded", "true")} onError={(error) => root.setAttribute("data-error", error.message)} /></main>);\n'),
  };
  Object.assign(entries, await assetEntries(files, storage, "public/"));
  for (const path of Object.keys(entries)) if (!safePortablePath(path)) throw new Error("Unsafe bundle path.");
  return entries;
}

export async function buildReactBundle(manifest: ExportManifest, files: ResolvedExportFile[], storage: Pick<AssetStorage, "read">): Promise<Uint8Array> {
  // ponytail: In-memory ZIP is bounded by the local export size; switch to streaming when multi-gigabyte exports are required.
  return zipSync(await reactBundleEntries(manifest, files, storage), { level: 6 });
}
