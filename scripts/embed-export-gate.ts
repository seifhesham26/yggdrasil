import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { unzipSync } from "fflate";
import sharp from "sharp";
import { defaultProjectSnapshot } from "../src/features/projects/domain/project-state";
import { ExportManifestSchema, type ResolvedExportFile, safePortablePath } from "../src/features/exports/domain/export-manifest";
import { buildEmbedBundle } from "../src/features/exports/infrastructure/embed-bundle";
import { parseStorageKey } from "../src/lib/storage/storage-key";
import { createGltfFixture } from "../src/test/fixtures/create-gltf-fixture";

const root = await mkdtemp(join(tmpdir(), "yggdrasil-embed-gate-"));
const fixture = createGltfFixture();
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const data = new Map<string, Uint8Array>();
const files: ResolvedExportFile[] = [fixture.model, fixture.binary].map((file, index) => {
  const storageKey = parseStorageKey(`assets/fixture/${file.relativePath}`);
  data.set(storageKey, file.bytes);
  return { path: `assets/source/${file.relativePath}`, storageKey, sha256: hash(file.bytes), byteSize: file.bytes.byteLength, mimeType: index ? "application/octet-stream" : "model/gltf+json", role: index ? "dependency" : "model" };
});
const document = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
document.buffers[0].uri = `data:application/octet-stream;base64,${Buffer.from(fixture.binary.bytes).toString("base64")}`;
if (!globalThis.ProgressEvent) Object.defineProperty(globalThis, "ProgressEvent", { value: class extends Event { constructor(type: string, init: { loaded: number; total: number }) { super(type); Object.assign(this, init); } } });
const parsed = await new GLTFLoader().parseAsync(JSON.stringify(document), "");
const object = parsed.scene.children[0];
const partId = `0:${encodeURIComponent(object.type)}:${encodeURIComponent(object.name || object.type)}`;
const snapshot = defaultProjectSnapshot();
snapshot.animation.embeddedClips = [{ id: randomUUID(), sourceIndex: 0, name: "Rise", enabled: true, trimStart: 0, trimEnd: 1, speed: 1, loop: "repeat" }];
snapshot.interactions = [{ id: "hotspot-one", targetNodeId: partId, trigger: "hotspot", action: { type: "show-annotation", annotation: "Hello from export" } }];
const manifest = ExportManifestSchema.parse({ formatVersion: 1, projectId: randomUUID(), projectName: "Triangle", projectRevision: 1, projectRevisionId: null, assetVersionId: randomUUID(), createdAt: new Date().toISOString(), modelPath: files[0].path, files: files.map(({ storageKey: _storageKey, ...file }) => file), config: snapshot, attribution: [], warnings: ["Test fixture"] });
let viewerServer: Server | undefined;
let hostServer: Server | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

function listen(server: Server): Promise<number> {
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done((server.address() as { port: number }).port)));
}
async function difference(left: Buffer, right: Buffer) {
  const [a, b] = await Promise.all([sharp(left).resize(300, 240).raw().toBuffer(), sharp(right).resize(300, 240).raw().toBuffer()]);
  return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / a.length;
}

try {
  const zip = await buildEmbedBundle(manifest, files, { read: async (key) => { const bytes = data.get(key); if (!bytes) throw new Error("Missing fixture file"); return bytes; } });
  for (const [path, bytes] of Object.entries(unzipSync(zip))) { const target = join(root, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); }
  viewerServer = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname).replace(/^\//, "") || "host.html";
    if (!safePortablePath(path)) { response.writeHead(400).end(); return; }
    try { const bytes = await readFile(join(root, path)); response.setHeader("content-type", ({ ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".gltf": "model/gltf+json", ".bin": "application/octet-stream" } as Record<string, string>)[extname(path)] ?? "application/octet-stream"); response.end(bytes); }
    catch { response.writeHead(404).end(); }
  });
  const viewerOrigin = `http://127.0.0.1:${await listen(viewerServer)}`;
  hostServer = createServer((_request, response) => response.end(`<!doctype html><title>Cross-origin host</title><iframe id="viewer" title="Interactive 3D model" src="${viewerOrigin}/viewer.html?origin=HOST_ORIGIN"></iframe><p id="status"></p><script>const frame=document.getElementById("viewer");frame.src=frame.src.replace("HOST_ORIGIN",encodeURIComponent(location.origin));addEventListener("message",event=>{if(event.origin!=="${viewerOrigin}"||event.source!==frame.contentWindow||event.data?.channel!=="yggdrasil-viewer")return;if(["loaded","progress","error","interaction"].includes(event.data.type))document.getElementById("status").textContent=event.data.type;});</script>`));
  const hostOrigin = `http://127.0.0.1:${await listen(hostServer)}`;
  browser = await chromium.launch();
  const page = await browser.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(hostOrigin);
  await page.locator("#status").getByText("loaded").waitFor({ timeout: 30_000 });
  const frame = page.frameLocator("#viewer");
  const canvas = frame.locator("canvas");
  await page.waitForTimeout(250);
  const first = await canvas.screenshot(); await page.waitForTimeout(450);
  const animated = await difference(first, await canvas.screenshot());
  if (animated < 0.1) throw new Error(`Embed animation did not move (${animated.toFixed(2)}).`);
  await frame.getByRole("button", { name: /Hotspot/ }).focus();
  await page.keyboard.press("Enter");
  await frame.getByRole("status").getByText("Hello from export").waitFor();
  await page.locator("#status").getByText("interaction").waitFor();
  await page.evaluate(() => { const frame = document.querySelector("iframe")!; frame.style.width = "500px"; frame.style.height = "400px"; });
  await page.waitForTimeout(100);
  const dimensions = await canvas.evaluate((node) => ({ width: (node as HTMLCanvasElement).width, height: (node as HTMLCanvasElement).height }));
  if (dimensions.width < 400 || dimensions.height < 300) throw new Error("Embed did not resize with the host.");
  if (!requests.some((url) => url.endsWith("/assets/source/triangle.gltf")) || !requests.some((url) => url.endsWith("/assets/source/triangle.bin")) || requests.some((url) => url.includes("/api/"))) throw new Error("Embed did not load its own local assets.");
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.reload();
  await page.locator("#status").getByText("loaded").waitFor({ timeout: 30_000 });
  const still = await canvas.screenshot(); await page.waitForTimeout(450);
  const reducedDifference = await difference(still, await canvas.screenshot());
  if (reducedDifference > 0.1) throw new Error(`Reduced-motion embed kept moving (${reducedDifference.toFixed(2)}).`);
  const own = await browser.newPage();
  await own.goto(`${viewerOrigin}/viewer.html`);
  const teardown = await own.evaluate(async () => { const url = new URL("/viewer.js", location.href).href; const viewerModule = await import(url); const node = document.createElement("div"); document.body.append(node); const mounted = viewerModule.mountYggdrasilViewer(node, { manifestUrl: "/manifest.json", assetBaseUrl: "/" }); mounted.destroy(); return node.querySelector("canvas") === null; });
  if (!teardown) throw new Error("Programmatic embed teardown left a canvas mounted.");
  await own.route("**/manifest.json", (route) => route.fulfill({ status: 404 }));
  await own.reload();
  await own.getByText("Viewer unavailable.").waitFor();
  console.log(`EMBED_EXPORT_GATE_PASS: cross-origin event, keyboard hotspot, resize, mount/destroy, error fallback, local assets, animation ${animated.toFixed(2)}, reduced motion ${reducedDifference.toFixed(2)}.`);
} finally {
  await browser?.close();
  await new Promise<void>((done) => viewerServer?.close(() => done()) ?? done());
  await new Promise<void>((done) => hostServer?.close(() => done()) ?? done());
  const target = await realpath(root);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("yggdrasil-embed-gate-")) throw new Error("Refusing to remove an unexpected embed gate folder.");
  await rm(target, { recursive: true, force: true });
}
