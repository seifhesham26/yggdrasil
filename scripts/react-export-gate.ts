import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { unzipSync } from "fflate";
import sharp from "sharp";
import { defaultProjectSnapshot } from "../src/features/projects/domain/project-state";
import { ExportManifestSchema, type ResolvedExportFile } from "../src/features/exports/domain/export-manifest";
import { buildReactBundle } from "../src/features/exports/infrastructure/react-bundle";
import { parseStorageKey } from "../src/lib/storage/storage-key";
import { createGltfFixture } from "../src/test/fixtures/create-gltf-fixture";

const execFileAsync = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "yggdrasil-react-gate-"));
const fixture = createGltfFixture();
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const data = new Map<string, Uint8Array>();
const files: ResolvedExportFile[] = [fixture.model, fixture.binary].map((file, index) => {
  const storageKey = parseStorageKey(`assets/fixture/${file.relativePath}`);
  data.set(storageKey, file.bytes);
  return { path: `assets/source/${file.relativePath}`, storageKey, sha256: hash(file.bytes), byteSize: file.bytes.byteLength, mimeType: index ? "application/octet-stream" : "model/gltf+json", role: index ? "dependency" : "model" };
});
const snapshot = defaultProjectSnapshot();
snapshot.animation.embeddedClips = [{ id: randomUUID(), sourceIndex: 0, name: "Rise", enabled: true, trimStart: 0, trimEnd: 1, speed: 1, loop: "repeat" }];
const manifest = ExportManifestSchema.parse({ formatVersion: 1, projectId: randomUUID(), projectName: "Triangle", projectRevision: 1, projectRevisionId: null, assetVersionId: randomUUID(), createdAt: new Date().toISOString(), modelPath: files[0].path, files: files.map(({ storageKey: _storageKey, ...file }) => file), config: snapshot, attribution: [], warnings: ["Test fixture"] });
let server: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

function run(args: string[]) {
  return new Promise<void>((done, fail) => {
    const child = spawn("pnpm.cmd", args, { cwd: root, stdio: "inherit", windowsHide: true, shell: true });
    child.on("error", fail);
    child.on("exit", (code) => code === 0 ? done() : fail(new Error(`pnpm ${args.join(" ")} exited ${code}`)));
  });
}

async function difference(left: Buffer, right: Buffer) {
  const [a, b] = await Promise.all([sharp(left).resize(300, 240).raw().toBuffer(), sharp(right).resize(300, 240).raw().toBuffer()]);
  return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / a.length;
}

try {
  const zip = await buildReactBundle(manifest, files, { read: async (key) => { const bytes = data.get(key); if (!bytes) throw new Error("Missing fixture file"); return bytes; } });
  for (const [path, bytes] of Object.entries(unzipSync(zip))) { const target = join(root, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); }
  await run(["install", "--ignore-scripts"]);
  await run(["build"]);
  const baseURL = "http://127.0.0.1:3400";
  server = spawn("pnpm.cmd", ["dev", "--port", "3400"], { cwd: root, stdio: "ignore", windowsHide: true, shell: true });
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(baseURL)).ok) break; } catch { /* startup */ } await new Promise((done) => setTimeout(done, 200)); }
  browser = await chromium.launch();
  const page = await browser.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(baseURL);
  await page.locator("#root[data-loaded=true]").waitFor({ timeout: 30_000 });
  const canvas = page.locator("canvas");
  await page.waitForTimeout(250);
  const first = await canvas.screenshot();
  await page.waitForTimeout(450);
  const animated = await difference(first, await canvas.screenshot());
  if (animated < 0.1) throw new Error(`Independent React animation did not change the image (${animated.toFixed(2)}).`);
  if (!requests.some((url) => url.endsWith("/assets/source/triangle.gltf")) || !requests.some((url) => url.endsWith("/assets/source/triangle.bin")) || requests.some((url) => url.includes("/api/"))) throw new Error("React sample did not resolve only its local export assets.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator("#root[data-loaded=true]").waitFor({ timeout: 30_000 });
  const still = await canvas.screenshot();
  await page.waitForTimeout(450);
  const reducedDifference = await difference(still, await canvas.screenshot());
  if (reducedDifference > 0.1) throw new Error(`Reduced-motion render kept animating (${reducedDifference.toFixed(2)}).`);
  console.log(`REACT_EXPORT_GATE_PASS: independent install/build/browser; local glTF and bin; animation difference ${animated.toFixed(2)}; reduced-motion difference ${reducedDifference.toFixed(2)}.`);
} finally {
  await browser?.close();
  if (server?.pid) try { await execFileAsync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }); } catch { /* process exited */ }
  const target = await realpath(root);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("yggdrasil-react-gate-")) throw new Error("Refusing to remove an unexpected React gate folder.");
  await rm(target, { recursive: true, force: true });
}
