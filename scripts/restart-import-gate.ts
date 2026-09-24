import { randomBytes, createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { Client } from "pg";
import { createGltfFixture } from "../src/test/fixtures/create-gltf-fixture";

if (process.platform !== "win32") throw new Error("This restart gate currently requires Windows taskkill for process-tree shutdown.");
if (existsSync(".env")) process.loadEnvFile(".env");
const databaseUrl = process.env.YGGDRASIL_E2E_DATABASE_URL;
if (!databaseUrl) throw new Error("Set YGGDRASIL_E2E_DATABASE_URL to an empty migrated PostgreSQL database.");
if (databaseUrl === process.env.DATABASE_URL) throw new Error("Restart gate requires a database separate from DATABASE_URL.");

const port = 3210;
const baseURL = `http://127.0.0.1:${port}`;
const ownerEmail = `restart-${randomBytes(6).toString("hex")}@example.test`;
const ownerName = `Restart Gate ${randomBytes(6).toString("hex")}`;
const ownerPassword = randomBytes(24).toString("base64url");
const secret = randomBytes(32).toString("hex");
const assetRoot = await mkdtemp(join(tmpdir(), "yggdrasil-restart-gate-"));
const client = new Client({ connectionString: databaseUrl });
const execFileAsync = promisify(execFile);
let server: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let connected = false;

async function waitForServer(ready: boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    let reachable = false;
    try { reachable = (await fetch(`${baseURL}/sign-in`, { signal: AbortSignal.timeout(500) })).ok; } catch { /* Startup and shutdown are expected to refuse connections. */ }
    if (reachable === ready) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`App did not become ${ready ? "ready" : "stopped"} at ${baseURL}`);
}

async function startServer() {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(port)], {
    cwd: process.cwd(), windowsHide: true, stdio: "ignore",
    env: { ...process.env, DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseURL, BETTER_AUTH_SECRET: secret, YGGDRASIL_OWNER_EMAIL: ownerEmail, YGGDRASIL_ASSET_ROOT: assetRoot },
  });
  await waitForServer(true);
}

async function stopServer() {
  if (!server?.pid) return;
  const pid = server.pid;
  server = undefined;
  try { await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }); } catch { /* A process that already exited needs no stop. */ }
  await waitForServer(false);
}

try {
  await client.connect();
  connected = true;
  const [{ users, assets }] = (await client.query<{ users: string; assets: string }>('select (select count(*) from "user") as users, (select count(*) from assets) as assets')).rows;
  if (users !== "0" || assets !== "0") throw new Error("Restart gate requires an empty isolated database.");

  await startServer();
  browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/sign-in");
  await page.getByLabel("Display name").fill(ownerName);
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await page.waitForURL("**/library");

  const { model, binary } = createGltfFixture();
  await page.route("**/api/assets/import/jobs/*/run", (route) => route.abort());
  await page.getByLabel("Choose model files").setInputFiles([
    { name: model.relativePath, mimeType: "model/gltf+json", buffer: Buffer.from(model.bytes) },
    { name: binary.relativePath, mimeType: "application/octet-stream", buffer: Buffer.from(binary.bytes) },
  ]);
  const uploadResponse = page.waitForResponse((response) => response.url().endsWith("/api/assets/import/jobs") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Import asset" }).click();
  const uploaded = await uploadResponse;
  if (uploaded.status() !== 202) throw new Error(`Job upload failed: ${uploaded.status()} ${await uploaded.text()}`);
  const { jobId } = await uploaded.json() as { jobId: string };
  await page.getByRole("alert").filter({ hasText: "could not be saved" }).waitFor();
  const pending = await (await page.request.get(`/api/assets/import/jobs/${jobId}`)).json() as { phase: string };
  if (pending.phase !== "received") throw new Error(`Expected a received job before restart; got ${pending.phase}`);
  if (await page.evaluate(() => localStorage.getItem("yggdrasil.activeImportJob")) !== jobId) throw new Error("Browser did not retain the job ID.");

  // Model a process stop after its first durable checkpoint. The expired
  // lease makes the persisted job claimable by the next app process.
  await client.query("update import_jobs set phase = 'staging', next_file = 1, processed_bytes = $2, lease_until = now() - interval '1 second' where id = $1", [jobId, model.bytes.byteLength]);

  await stopServer();
  await startServer();
  await page.unroute("**/api/assets/import/jobs/*/run");
  await page.reload();
  await page.getByText("Import complete").waitFor({ timeout: 30_000 });
  const completed = await (await page.request.get(`/api/assets/import/jobs/${jobId}`)).json() as { phase: string; assetId: string };
  if (completed.phase !== "completed" || completed.assetId !== jobId) throw new Error("Restarted job did not complete on its original asset ID.");
  const fileUrl = `/api/assets/${jobId}/file?key=${encodeURIComponent(`assets/${jobId}/source/${model.relativePath}`)}`;
  const stored = await (await page.request.get(fileUrl)).body();
  if (createHash("sha256").update(stored).digest("hex") !== createHash("sha256").update(model.bytes).digest("hex")) throw new Error("Restart changed the original model bytes.");
  const assetCount = (await client.query<{ count: string }>("select count(*) from assets where id = $1", [jobId])).rows[0].count;
  if (assetCount !== "1") throw new Error(`Expected one asset after restart; found ${assetCount}.`);
  console.log("RESTART_IMPORT_GATE_PASS: expired staged job resumed after app restart; one asset and unchanged source hash.");
} finally {
  await browser?.close();
  await stopServer();
  if (connected) {
    await client.query('delete from "user" where email = $1 and name = $2', [ownerEmail, ownerName]);
    await client.end();
  }
  const target = await realpath(assetRoot);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("yggdrasil-restart-gate-")) throw new Error("Refusing to remove an unexpected restart gate folder.");
  await rm(target, { recursive: true, force: true });
}
