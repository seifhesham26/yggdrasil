import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { unzipSync } from "fflate";
import { defaultProjectSnapshot, type ProjectSnapshot } from "../src/features/projects/domain/project-state";
import { ExportManifestSchema, safePortablePath, type ResolvedExportFile } from "../src/features/exports/domain/export-manifest";
import { buildPackageBundle } from "../src/features/exports/infrastructure/package-bundle";
import { parseStorageKey } from "../src/lib/storage/storage-key";
import { createGltfFixture } from "../src/test/fixtures/create-gltf-fixture";

const root = await mkdtemp(join(tmpdir(), "yggdrasil-package-gate-"));
const fixture = createGltfFixture();
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const data = new Map<string, Uint8Array>();
const files: ResolvedExportFile[] = [fixture.model, fixture.binary].map((file, index) => {
  const storageKey = parseStorageKey(`assets/fixture/${file.relativePath}`);
  data.set(storageKey, file.bytes);
  return { path: `assets/source/${file.relativePath}`, storageKey, sha256: hash(file.bytes), byteSize: file.bytes.byteLength, mimeType: index ? "application/octet-stream" : "model/gltf+json", role: index ? "dependency" : "model" };
});
const policies = ["on-demand", "metadata-first", "critical-assets", "full-preload"] as const;
let server: Server | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const listen = (server: Server) => new Promise<number>((done) => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));

try {
  for (const policy of policies) {
    const snapshot: ProjectSnapshot = defaultProjectSnapshot();
    snapshot.export.loadingPolicy = policy;
    snapshot.export.criticalAssetIds = policy === "critical-assets" ? [files[1].path] : [];
    const manifest = ExportManifestSchema.parse({ formatVersion: 1, projectId: randomUUID(), projectName: "Triangle", projectRevision: 1, projectRevisionId: null, assetVersionId: randomUUID(), createdAt: new Date().toISOString(), modelPath: files[0].path, files: files.map(({ storageKey: _key, ...file }) => file), config: snapshot, attribution: [], warnings: ["Test fixture"] });
    const zip = await buildPackageBundle(manifest, files, { read: async (key) => { const bytes = data.get(key); if (!bytes) throw new Error("Missing fixture file"); return bytes; } });
    const entries = unzipSync(zip);
    const required = ["manifest.json", "README.md", "dependencies.json", "licenses.json", "attribution.txt", "react/src/YggdrasilModel.tsx", "react/src/main.tsx", "react/package.json", "embed/viewer.html", "embed/viewer.js", ...files.flatMap((file) => [`react/public/${file.path}`, `embed/${file.path}`])];
    if (required.some((path) => !entries[path]) || Object.keys(entries).some((path) => !safePortablePath(path))) throw new Error(`${policy} package is incomplete or unsafe.`);
    for (const file of files) if (hash(entries[`react/public/${file.path}`]) !== file.sha256 || hash(entries[`embed/${file.path}`]) !== file.sha256) throw new Error(`${policy} changed an asset byte.`);
    if (/sourceStorageKey|postgres(?:ql)?:\/\/|BETTER_AUTH_SECRET|DATABASE_URL|[a-z]:\\/i.test(new TextDecoder().decode(entries["manifest.json"]))) throw new Error(`${policy} leaked private state.`);
    for (const [path, bytes] of Object.entries(entries)) { const target = join(root, policy, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); }
  }
  server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname).replace(/^\//, "");
    if (!safePortablePath(path)) { response.writeHead(400).end(); return; }
    try { const bytes = await readFile(join(root, path)); response.setHeader("content-type", ({ ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".gltf": "model/gltf+json", ".bin": "application/octet-stream" } as Record<string, string>)[extname(path)] ?? "application/octet-stream"); response.setHeader("cache-control", "no-store"); response.end(bytes); }
    catch { response.writeHead(404).end(); }
  });
  const origin = `http://127.0.0.1:${await listen(server)}`;
  browser = await chromium.launch();
  for (const policy of policies) {
    const page = await browser.newPage();
    const requests: string[] = [];
    page.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.endsWith("manifest.json") || path.includes("/assets/source/")) requests.push(path.split("/").at(-1)!); });
    await page.goto(`${origin}/${policy}/embed/viewer.html`);
    await page.getByRole("img", { name: "3D model viewer" }).waitFor();
    if (policy === "on-demand") {
      await page.waitForTimeout(300);
      if (requests.some((item) => item.startsWith("triangle."))) throw new Error("On-demand loaded model assets before a click.");
      await page.getByRole("button", { name: "Load model" }).click();
    }
    await page.locator("canvas").waitFor({ timeout: 30_000 });
    await page.getByText("Loading model…").waitFor({ state: "hidden", timeout: 30_000 });
    if (requests[0] !== "manifest.json" || !requests.includes("triangle.gltf") || !requests.includes("triangle.bin")) throw new Error(`${policy} request trace was incomplete: ${requests.join(", ")}`);
    if (policy === "critical-assets" && requests.indexOf("triangle.bin") > requests.indexOf("triangle.gltf")) throw new Error(`Critical file did not load before model: ${requests.join(", ")}`);
    if (policy === "full-preload" && requests.filter((item) => item === "triangle.gltf").length < 2) throw new Error(`Full preload did not fetch before renderer: ${requests.join(", ")}`);
    if (policy === "metadata-first" && requests[1] !== "triangle.gltf") throw new Error(`Metadata-first did not request model next: ${requests.join(", ")}`);
    console.log(`PACKAGE_POLICY_${policy.toUpperCase().replaceAll("-", "_")}_PASS: ${requests.join(" -> ")}`);
    if (policy === "metadata-first") {
      let failed = false;
      await page.route("**/assets/source/triangle.gltf", (route) => { if (!failed) { failed = true; return route.fulfill({ status: 503 }); } return route.continue(); });
      await page.reload();
      await page.getByRole("alert").getByRole("button", { name: "Retry loading" }).click();
      await page.getByRole("alert").waitFor({ state: "hidden", timeout: 30_000 });
      await page.locator("canvas").waitFor();
      console.log("PACKAGE_LOAD_RETRY_PASS: failed model request showed an error and retry recovered.");
    }
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise<void>((done) => server?.close(() => done()) ?? done());
  const target = await realpath(root);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("yggdrasil-package-gate-")) throw new Error("Refusing to remove an unexpected package gate folder.");
  await rm(target, { recursive: true, force: true });
}
