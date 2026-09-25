import { randomBytes, createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { Client } from "pg";
import { createGltfFixture } from "../src/test/fixtures/create-gltf-fixture";
import sharp from "sharp";

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

async function meanPixelDifference(left: Buffer, right: Buffer): Promise<number> {
  const [a, b] = await Promise.all([sharp(left).resize(390, 450, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(right).resize(390, 450, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
  let total = 0;
  for (let index = 0; index < a.data.length; index += 4) total += Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]);
  return total / (a.info.width * a.info.height * 3);
}

async function warmModelPixels(image: Buffer): Promise<number> {
  const { data } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index] > 55 && data[index] > data[index + 1] * 1.35 && data[index] > data[index + 2] * 1.2) count++;
  return count;
}

function scaledFixture(name: string, scale: number) {
  const base = createGltfFixture();
  const model = JSON.parse(new TextDecoder().decode(base.model.bytes));
  model.nodes[0].name = name;
  model.buffers[0].uri = `${name}.bin`;
  model.accessors[0].max = [scale, scale, 0];
  const binary = Uint8Array.from(base.binary.bytes);
  const view = new DataView(binary.buffer);
  view.setFloat32(3 * 4, scale, true);
  view.setFloat32(7 * 4, scale, true);
  return { model: { relativePath: `${name}.gltf`, bytes: new TextEncoder().encode(JSON.stringify(model)) }, binary: { relativePath: `${name}.bin`, bytes: binary } };
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
  await page.getByText("Select a model variant").waitFor();
  await page.getByRole("button", { name: `Use ${model.relativePath}` }).click();
  await page.getByRole("alert").filter({ hasText: "could not be saved" }).waitFor();
  const pending = await (await page.request.get(`/api/assets/import/jobs/${jobId}`)).json() as { phase: string };
  if (pending.phase !== "received") throw new Error(`Expected a received job before restart; got ${pending.phase}`);
  if ((await client.query<{ count: string }>("select count(*) from assets where id = $1", [jobId])).rows[0].count !== "0") throw new Error("Unfinished job appeared as a library asset.");
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
  const sourceHash = createHash("sha256").update(model.bytes).digest("hex");
  if (createHash("sha256").update(stored).digest("hex") !== sourceHash) throw new Error("Restart changed the original model bytes.");
  const assetCount = (await client.query<{ count: string }>("select count(*) from assets where id = $1", [jobId])).rows[0].count;
  if (assetCount !== "1") throw new Error(`Expected one asset after restart; found ${assetCount}.`);
  console.log("RESTART_IMPORT_GATE_PASS: expired staged job resumed after app restart; one asset and unchanged source hash.");
  console.log(`RESTART_SOURCE_SHA256=${sourceHash}`);

  await page.goto(`/assets/${jobId}`);
  const originalHistory = await (await page.request.get(`/api/assets/${jobId}/optimization?view=history`)).json() as { versions: Array<{ id: string }> };
  if (originalHistory.versions.length !== 1) throw new Error("Expected exactly one retained original before optimization.");
  const originalVersionId = originalHistory.versions[0].id;
  const promotion = page.waitForResponse((response) => response.url().endsWith(`/api/assets/${jobId}/optimization`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Approve normalization" }).click();
  const promoted = await promotion;
  if (promoted.status() !== 200) throw new Error(`Normalization failed: ${promoted.status()} ${await promoted.text()}`);
  const derived = await promoted.json() as { id: string; storageKey: string };
  await stopServer();
  await startServer();
  await page.reload();
  await page.locator(".asset-preview-section[data-version-id]").waitFor({ timeout: 30_000 });
  if (await page.locator(".asset-preview-section").getAttribute("data-version-id") !== derived.id) throw new Error("Restart did not restore the selected derived version ID.");
  const reopenedHistory = await (await page.request.get(`/api/assets/${jobId}/optimization?view=history`)).json() as { versions: Array<{ id: string }>; currentVersionId: string };
  if (reopenedHistory.currentVersionId !== derived.id || reopenedHistory.versions.length !== 2 || !reopenedHistory.versions.some((version) => version.id === originalVersionId) || !reopenedHistory.versions.some((version) => version.id === derived.id)) throw new Error(`Restart did not retain both version IDs and current selection: current=${reopenedHistory.currentVersionId}, versions=${reopenedHistory.versions.map((version) => version.id).join(",")}, expected=${originalVersionId},${derived.id}.`);
  const reopened = await page.request.get(`/api/assets/${jobId}/file?key=${encodeURIComponent(derived.storageKey)}`);
  if (reopened.status() !== 200 || (await reopened.body()).subarray(0, 4).toString() !== "glTF") throw new Error("Restart did not reopen the derived GLB.");
  const originalReopened = await (await page.request.get(fileUrl)).body();
  if (createHash("sha256").update(originalReopened).digest("hex") !== createHash("sha256").update(model.bytes).digest("hex")) throw new Error("Optimization restart changed source bytes.");
  console.log("OPTIMIZATION_RESTART_GATE_PASS: derived version ID and GLB reopened; original source hash unchanged.");

  // Exercise the editor against the same isolated database and retained model.
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL("**/projects/*");
  const projectUrl = new URL(page.url()).pathname;
  const projectId = projectUrl.split("/").at(-1)!;
  const initialProject = await (await page.request.get(`/api/projects/${projectId}`)).json() as { project: { assetVersionId: string } };
  if (initialProject.project.assetVersionId !== derived.id) throw new Error("Project is not bound to the selected retained version.");
  await page.getByRole("button", { name: "Scene step" }).click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Scene step"]')?.getAttribute("aria-current") === "step");
  await page.getByLabel("Background color").fill("#123456");
  await page.getByRole("status").getByText("Unsaved changes").waitFor();

  await client.query(`CREATE FUNCTION e2e_fail_project_save() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.project_id = '${projectId}'::uuid THEN RAISE EXCEPTION 'E2E temporary project write failure'; END IF;
    RETURN NEW; END $$;
    CREATE TRIGGER e2e_fail_project_save BEFORE INSERT ON project_revisions FOR EACH ROW EXECUTE FUNCTION e2e_fail_project_save();`);
  try {
    await page.getByRole("button", { name: "Save project" }).click();
    await page.getByRole("button", { name: "Retry save" }).waitFor();
    if (await page.getByRole("status").textContent() !== "Unsaved changes") throw new Error("Failed save falsely reported saved state.");
    if (await page.getByLabel("Background color").inputValue() !== "#123456") throw new Error("Failed save lost local edits.");
  } finally {
    await client.query("DROP TRIGGER IF EXISTS e2e_fail_project_save ON project_revisions; DROP FUNCTION IF EXISTS e2e_fail_project_save();");
  }
  await page.getByRole("button", { name: "Retry save" }).click();
  await page.getByRole("status").getByText("Saved").waitFor();
  await stopServer();
  await startServer();
  await page.reload();
  if (await page.getByLabel("Background color").inputValue() !== "#123456") throw new Error("Restart did not restore scene color.");
  if (await page.getByRole("button", { name: "Scene step" }).getAttribute("aria-current") !== "step") throw new Error("Restart did not restore the active step.");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(() => (document.querySelector('input[aria-label="Background color"]') as HTMLInputElement)?.value === "#111417");
  await page.getByRole("button", { name: "Redo" }).click();
  await page.waitForFunction(() => (document.querySelector('input[aria-label="Background color"]') as HTMLInputElement)?.value === "#123456");
  if (createHash("sha256").update(await (await page.request.get(fileUrl)).body()).digest("hex") !== sourceHash) throw new Error("Project editing changed source bytes.");

  await page.getByRole("button", { name: "Appearance step" }).click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Appearance step"]')?.getAttribute("aria-current") === "step");
  const hierarchy = page.getByRole("list", { name: "Model hierarchy" });
  const meshButton = hierarchy.locator('button[aria-label*="Mesh"]').first();
  await meshButton.waitFor();
  const selectedPartId = (await meshButton.getAttribute("aria-label"))!.split(" ").at(-1)!;
  await meshButton.click();
  if (await meshButton.getAttribute("aria-pressed") !== "true") throw new Error("Hierarchy selection did not identify the selected part.");
  await page.getByRole("progressbar", { name: "Loading model" }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Frame model" }).click();
  await page.waitForTimeout(300);
  const canvas = page.locator(".project-editor-preview canvas").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("Project viewport canvas is missing.");
  let pickedInViewport = false;
  for (const [x, y] of [[0.48, 0.52], [0.5, 0.5], [0.43, 0.57], [0.55, 0.45], [0.4, 0.6]]) {
    await canvas.click({ position: { x: canvasBox.width * x, y: canvasBox.height * y } });
    if (await page.getByText("Selected in viewport").isVisible().catch(() => false)) { pickedInViewport = true; break; }
  }
  if (!pickedInViewport || await meshButton.getAttribute("aria-pressed") !== "true") {
    const diagnostic = join(tmpdir(), "yggdrasil-appearance-pick.png");
    await writeFile(diagnostic, await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot());
    throw new Error(`Viewport selection did not identify the same target as the hierarchy (selected=${selectedPartId}, pressed=${await meshButton.getAttribute("aria-pressed")}, screenshot=${diagnostic}).`);
  }
  const originalPartColor = await page.getByLabel("Part color").inputValue();
  await page.getByLabel("Part color").fill("#ff0000");
  await page.getByRole("button", { name: "Save project" }).click();
  await page.getByRole("status").getByText("Saved").waitFor();
  await page.reload();
  await page.getByRole("list", { name: "Model hierarchy" }).locator('button[aria-label*="Mesh"]').first().click();
  if (await page.getByLabel("Part color").inputValue() !== "#ff0000") throw new Error("Appearance color did not survive reload.");
  const appearanceState = await (await page.request.get(`/api/projects/${projectId}`)).json() as { project: { snapshot: { appearance: { nodes: Record<string, { color?: string }> } } } };
  if (appearanceState.project.snapshot.appearance.nodes[selectedPartId]?.color !== "#ff0000") throw new Error("Appearance override targeted the wrong part.");
  await page.getByRole("button", { name: "Reset color" }).click();
  await page.getByRole("button", { name: "Save project" }).click();
  await page.getByRole("status").getByText("Saved").waitFor();
  await page.reload();
  await page.getByRole("list", { name: "Model hierarchy" }).locator('button[aria-label*="Mesh"]').first().click();
  if (await page.getByLabel("Part color").inputValue() !== originalPartColor) throw new Error("Individual color reset did not survive reload.");
  console.log("APPEARANCE_RELOAD_GATE_PASS: stable hierarchy ID, color override and individual reset survived reload; source hash unchanged.");

  await page.getByRole("button", { name: "Scene step" }).click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Scene step"]')?.getAttribute("aria-current") === "step");
  await page.getByLabel("Camera FOV").fill("180");
  await page.getByRole("alert").filter({ hasText: "Camera FOV must be between 1 and 170" }).waitFor();
  await page.getByLabel("Camera FOV").fill("60");
  await page.getByLabel("Environment").selectOption("outdoor");
  await page.getByRole("combobox", { name: "Controls" }).selectOption("turntable");
  await page.getByLabel("Reduced motion").check();
  await page.getByLabel("Preview size").selectOption("mobile");
  if (await page.getByRole("region", { name: "Project preview" }).getAttribute("data-preview-size") !== "mobile") throw new Error("Mobile scene preview was not selected.");
  await page.getByRole("button", { name: "Frame model" }).click();
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.getByRole("progressbar", { name: "Loading model" }).waitFor({ state: "hidden" });
  const beforeSceneReload = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  await page.getByRole("button", { name: "Save project" }).click();
  await page.getByRole("status").getByText("Saved").waitFor();
  await page.reload();
  if (await page.getByLabel("Camera FOV").inputValue() !== "60" || await page.getByLabel("Environment").inputValue() !== "outdoor" || await page.getByRole("combobox", { name: "Controls" }).inputValue() !== "turntable" || !(await page.getByLabel("Reduced motion").isChecked())) throw new Error("Scene settings did not survive reload.");
  await page.getByLabel("Preview size").selectOption("mobile");
  await page.getByRole("progressbar", { name: "Loading model" }).waitFor({ state: "hidden" });
  const afterSceneReload = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  const sceneDifference = await meanPixelDifference(beforeSceneReload, afterSceneReload);
  if (sceneDifference > 5) throw new Error(`Scene visual state changed after reload (mean channel difference ${sceneDifference.toFixed(2)}).`);
  await page.setViewportSize({ width: 720, height: 900 });
  await page.getByLabel("Camera FOV").waitFor();
  if (!(await page.getByRole("region", { name: "Project preview" }).isVisible())) throw new Error("Narrow scene preview is not usable.");
  await page.setViewportSize({ width: 1280, height: 720 });
  console.log(`SCENE_RELOAD_GATE_PASS: invalid FOV feedback, mobile/narrow preview, frame/reset, reduced motion, and screenshot comparison (mean channel difference ${sceneDifference.toFixed(2)}).`);

  await page.getByRole("button", { name: "Interactions step" }).click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Interactions step"]')?.getAttribute("aria-current") === "step");
  await page.getByLabel("Interaction target").selectOption(selectedPartId);
  await page.getByLabel("Trigger").selectOption("hotspot");
  await page.getByLabel("Interaction action").selectOption("show-annotation");
  await page.getByLabel("Annotation text").fill("Private wing note");
  await page.getByRole("button", { name: "Add interaction" }).click();
  await page.getByRole("button", { name: "Save project" }).click();
  await page.locator(".save-state").getByText("Saved").waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Preview interactions" }).click();
  await page.getByRole("button", { name: /^Hotspot/ }).first().click();
  await page.getByText("Private wing note").waitFor();
  await page.getByRole("button", { name: "Exit preview" }).click();

  for (const [trigger, text] of [["click", "Clicked mesh"], ["hover", "Hovered mesh"]]) {
    await page.getByLabel("Interaction target").selectOption(selectedPartId);
    await page.getByLabel("Trigger").selectOption(trigger);
    await page.getByLabel("Interaction action").selectOption("show-annotation");
    await page.getByLabel("Annotation text").fill(text);
    await page.getByRole("button", { name: "Add interaction" }).click();
  }
  await page.getByRole("button", { name: "Save project" }).click();
  await page.locator(".save-state").getByText("Saved").waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Preview interactions" }).click();
  await page.getByRole("progressbar", { name: "Loading model" }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Frame model" }).click();
  const interactionCanvas = page.locator(".project-editor-preview canvas").first();
  const interactionCanvasBox = await interactionCanvas.boundingBox();
  if (!interactionCanvasBox) throw new Error("Interaction preview canvas is missing.");
  let clicked = false;
  for (const [x, y] of [[0.48, 0.52], [0.5, 0.5], [0.43, 0.57], [0.55, 0.45], [0.4, 0.6]]) {
    await interactionCanvas.click({ position: { x: interactionCanvasBox.width * x, y: interactionCanvasBox.height * y } });
    if (await page.getByText("Clicked mesh").isVisible().catch(() => false)) { clicked = true; break; }
  }
  if (!clicked) throw new Error("Click interaction did not fire from the viewport.");
  await page.getByRole("button", { name: "Close annotation" }).click();
  await page.mouse.move(0, 0);
  let hovered = false;
  for (const [x, y] of [[0.48, 0.52], [0.5, 0.5], [0.43, 0.57], [0.55, 0.45], [0.4, 0.6]]) {
    await interactionCanvas.hover({ position: { x: interactionCanvasBox.width * x, y: interactionCanvasBox.height * y } });
    if (await page.getByText("Hovered mesh").isVisible().catch(() => false)) { hovered = true; break; }
    await page.mouse.move(0, 0);
  }
  if (!hovered) throw new Error("Hover interaction did not fire from the viewport.");
  await page.getByRole("button", { name: "Exit preview" }).click();

  await page.getByLabel("Interaction target").selectOption(selectedPartId);
  await page.getByLabel("Trigger").selectOption("hotspot");
  await page.getByLabel("Interaction action").selectOption("focus-camera");
  await page.getByLabel("Camera target").selectOption(selectedPartId);
  await page.getByRole("button", { name: "Add interaction" }).click();
  await page.getByRole("button", { name: "Save project" }).click();
  await page.locator(".save-state").getByText("Saved").waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Preview interactions" }).click();
  await page.getByRole("button", { name: /^Hotspot/ }).last().click();
  await page.getByText(/Camera focused on/).waitFor();
  if (!(await page.getByRole("img", { name: "3D model preview" }).getAttribute("data-camera-focus"))) throw new Error("Camera target did not affect the preview camera.");
  await page.getByRole("button", { name: "Exit preview" }).click();
  const currentProject = await (await page.request.get(`/api/projects/${projectId}`)).json() as { project: { revision: number; snapshot: Record<string, unknown> } };
  const interactions = currentProject.project.snapshot.interactions as Array<Record<string, unknown>>;
  const unsafe = await page.request.patch(`/api/projects/${projectId}`, { data: { action: "save", expectedRevision: currentProject.project.revision, activeStep: "Interactions", snapshot: { ...currentProject.project.snapshot, interactions: [...interactions, { id: "unsafe", targetNodeId: selectedPartId, trigger: "click", action: { type: "show-annotation", annotation: "Unsafe", script: "globalThis.e2eUnsafe = true" } }] } } });
  if (unsafe.status() !== 400) throw new Error("Executable interaction payload was accepted.");
  const missing = await page.request.patch(`/api/projects/${projectId}`, { data: { action: "save", expectedRevision: currentProject.project.revision, activeStep: "Interactions", snapshot: { ...currentProject.project.snapshot, interactions: [...interactions, { id: "missing-target", targetNodeId: "gone", trigger: "hover", action: { type: "show-annotation", annotation: "Missing" } }] } } });
  if (missing.status() !== 200) throw new Error("Missing-target fixture did not save for warning test.");
  await page.reload();
  await page.getByRole("alert").filter({ hasText: "missing part" }).waitFor();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(() => !document.body.textContent?.includes("Interaction missing-target targets a missing part"));
  console.log("INTERACTION_RELOAD_GATE_PASS: hotspot annotations and camera target work after reload; missing target warns; unsafe payload is rejected; undo clears warning.");

  await page.getByRole("button", { name: "Animate step" }).click();
  await page.getByRole("list", { name: "Source clips" }).getByText("Rise").waitFor();
  await page.getByRole("button", { name: "Add project copy" }).click();
  await page.getByLabel("Clip name").fill("Edited Rise");
  await page.getByLabel("Trim start (s)").fill("0.2");
  await page.getByLabel("Trim end (s)").fill("0.8");
  await page.getByLabel("Speed").fill("1.5");
  await page.getByLabel("Loop").selectOption("pingpong");
  await page.getByRole("button", { name: "Grid" }).click();
  await page.getByLabel("Scrub clip").fill("0");
  await page.waitForTimeout(200);
  const clipStartImage = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  await page.getByLabel("Scrub clip").fill("1");
  await page.waitForTimeout(200);
  const clipEndImage = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  const clipVisualDifference = await meanPixelDifference(clipStartImage, clipEndImage);
  if (clipVisualDifference < 0.5) throw new Error(`Scrubbing did not visibly change the model pose (mean channel difference ${clipVisualDifference.toFixed(2)}).`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByLabel("Scrub clip").fill("0.5");
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.getByRole("button", { name: "Remove Edited Rise copy" }).click();
  await page.getByRole("list", { name: "Project clips" }).getByRole("button", { name: "Edited Rise", exact: true }).click();
  await page.getByRole("checkbox", { name: "Enabled" }).uncheck();
  await page.getByRole("button", { name: "Save project" }).click();
  await page.locator(".save-state").getByText("Saved").waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Animate step" }).waitFor();
  if (await page.getByRole("button", { name: "Animate step" }).getAttribute("aria-current") !== "step") throw new Error("Animation step was not persisted.");
  await page.getByRole("list", { name: "Project clips" }).getByText("Edited Rise").waitFor();
  await page.getByRole("list", { name: "Source clips" }).getByText("Rise").waitFor();
  const animationState = await (await page.request.get(`/api/projects/${projectId}`)).json() as { project: { snapshot: { animation: { embeddedClips: Array<Record<string, unknown>> } } } };
  const [savedClip] = animationState.project.snapshot.animation.embeddedClips;
  if (animationState.project.snapshot.animation.embeddedClips.length !== 1 || savedClip.name !== "Edited Rise" || savedClip.trimStart !== 0.2 || savedClip.trimEnd !== 0.8 || savedClip.speed !== 1.5 || savedClip.loop !== "pingpong" || savedClip.enabled !== false) throw new Error("Project clip settings did not survive reload.");
  const storedAfterAnimation = await (await page.request.get(fileUrl)).body();
  if (createHash("sha256").update(storedAfterAnimation).digest("hex") !== sourceHash) throw new Error("Animation edits changed original model bytes.");
  console.log(`EMBEDDED_CLIP_RELOAD_GATE_PASS: source and project copies, preview transport (scrub screenshot difference ${clipVisualDifference.toFixed(2)}), duplicate/remove, trim/speed/loop/disable, saved reload, unchanged source hash.`);

  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [name, scale] of [["tiny", 0.00001], ["large", 100000]] as const) {
    await page.goto("/library");
    const scaled = scaledFixture(name, scale);
    await page.getByLabel("Choose model files").setInputFiles([
      { name: scaled.model.relativePath, mimeType: "model/gltf+json", buffer: Buffer.from(scaled.model.bytes) },
      { name: scaled.binary.relativePath, mimeType: "application/octet-stream", buffer: Buffer.from(scaled.binary.bytes) },
    ]);
    await page.getByRole("button", { name: "Import asset" }).click();
    await page.getByText("Select a model variant").waitFor();
    await page.getByRole("button", { name: `Use ${scaled.model.relativePath}` }).click();
    await page.getByText("Import complete").waitFor({ timeout: 30_000 });
    await page.getByRole("link", { name: "Open asset report" }).click();
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL("**/projects/*");
    await page.getByRole("progressbar", { name: "Loading model" }).waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Grid" }).click();
    await page.getByRole("button", { name: "Frame model" }).click();
    await page.waitForTimeout(700);
    const frameImage = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
    const warmPixels = await warmModelPixels(frameImage);
    if (warmPixels < 100) {
      const diagnostic = join(tmpdir(), `yggdrasil-frame-${name}.png`);
      await writeFile(diagnostic, frameImage);
      throw new Error(`${name} model did not frame visibly (${warmPixels} warm pixels); screenshot=${diagnostic}.`);
    }
    console.log(`SCENE_FRAME_${name.toUpperCase()}_PASS: ${warmPixels} visible model pixels at scale ${scale}.`);
  }
  await page.goto(projectUrl);

  // Transfer only this throwaway project to another throwaway owner to verify
  // the browser route and API both deny the original session.
  const otherOwnerId = `e2e-other-${randomBytes(6).toString("hex")}`;
  const [{ owner_id: projectOwnerId }] = (await client.query<{ owner_id: string }>("select owner_id from projects where id = $1", [projectId])).rows;
  await client.query('insert into "user" (id, name, email) values ($1, $2, $3)', [otherOwnerId, "E2E Other", `${otherOwnerId}@example.test`]);
  try {
    await client.query("update projects set owner_id = $1 where id = $2", [otherOwnerId, projectId]);
    if ((await page.request.get(`/api/projects/${projectId}`)).status() !== 404) throw new Error("Cross-owner project read was allowed.");
    if ((await page.request.patch(`/api/projects/${projectId}`, { data: { action: "step", activeStep: "Export" } })).status() !== 404) throw new Error("Cross-owner project write was allowed.");
    if ((await page.goto(projectUrl))?.status() !== 404) throw new Error("Cross-owner editor page was allowed.");
  } finally {
    await client.query("update projects set owner_id = $1 where id = $2", [projectOwnerId, projectId]);
    await client.query('delete from "user" where id = $1', [otherOwnerId]);
  }
  console.log("PROJECT_RESTART_GATE_PASS: save failure and retry, step/revision persistence after process restart, owner isolation, and unchanged source hash.");
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
