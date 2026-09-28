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

function animationGlbFixture() {
  const fixture = createGltfFixture();
  const document = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
  delete document.buffers[0].uri;
  document.animations[0].name = "Imported Rise";
  const encoded = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const binLength = Math.ceil(fixture.binary.bytes.length / 4) * 4;
  const glb = new Uint8Array(12 + 8 + jsonLength + 8 + binLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, glb.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + jsonLength); glb.set(encoded, 20);
  view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  glb.set(fixture.binary.bytes, 28 + jsonLength);
  return glb;
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
  await page.getByRole("region", { name: "Selected clip" }).locator("select").selectOption("pingpong");
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

  const importedGlb = animationGlbFixture();
  const importedSourceHash = createHash("sha256").update(importedGlb).digest("hex");
  await page.getByLabel("Import animation").setInputFiles({ name: "imported-rise.glb", mimeType: "model/gltf-binary", buffer: Buffer.from(importedGlb) });
  await page.getByRole("combobox", { name: "Map Animated_Triangle" }).waitFor();
  if (await page.getByRole("combobox", { name: "Map Animated_Triangle" }).inputValue() !== "Animated_Triangle") throw new Error("Compatible imported track was not mapped to the retained model node.");
  await page.getByRole("button", { name: "Attach imported clip" }).click();
  await page.locator(".save-state").getByText("Saved").waitFor();
  await page.getByRole("list", { name: "Imported clips" }).getByRole("button", { name: "Imported Rise" }).waitFor();
  await page.getByLabel("Scrub clip").fill("0");
  await page.waitForTimeout(200);
  const importedStart = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  await page.getByLabel("Scrub clip").fill("1");
  await page.waitForTimeout(200);
  const importedEnd = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  const importedDifference = await meanPixelDifference(importedStart, importedEnd);
  if (importedDifference < 0.5) throw new Error(`Imported clip did not visibly change the model pose (${importedDifference.toFixed(2)}).`);
  const importedState = await (await page.request.get(`/api/projects/${projectId}`)).json() as { project: { revision: number; snapshot: { animation: { importedClips: Array<{ id: string; sourceSha256: string; sourceStorageKey: string; tracks: Array<{ targetNode: string }> }> } } } };
  const [attachedImport] = importedState.project.snapshot.animation.importedClips;
  if (attachedImport.sourceSha256 !== importedSourceHash || attachedImport.tracks[0].targetNode !== "Animated_Triangle") throw new Error("Imported source hash or saved target mapping differs from the uploaded fixture.");
  const persistedImport = await (await import("node:fs/promises")).readFile(join(assetRoot, ...attachedImport.sourceStorageKey.split("/")));
  if (createHash("sha256").update(persistedImport).digest("hex") !== importedSourceHash) throw new Error("Private imported source bytes changed.");
  await page.reload();
  await page.getByRole("list", { name: "Imported clips" }).getByRole("button", { name: "Imported Rise" }).click();
  await page.getByLabel("Scrub clip").fill("1");
  await page.getByRole("img", { name: "3D model preview" }).waitFor();

  const incompatibleManifest = Buffer.from(JSON.stringify({ name: "Missing", tracks: [{ target: "AbsentBone", path: "position", times: [0, 1], values: [0, 0, 0, 1, 0, 0] }] }));
  await page.getByLabel("Import animation").setInputFiles({ name: "missing.json", mimeType: "application/json", buffer: incompatibleManifest });
  await page.getByRole("combobox", { name: "Map AbsentBone" }).waitFor();
  if (await page.getByRole("button", { name: "Attach imported clip" }).isEnabled()) throw new Error("Missing imported target could be attached.");
  const tampered = await page.request.post(`/api/projects/${projectId}/animation-import`, { data: { fileName: "imported-rise.glb", bytesBase64: Buffer.from(importedGlb).toString("base64"), clip: { ...attachedImport, tracks: [{ ...attachedImport.tracks[0], values: [9, 9, 9, 9, 9, 9] }] } } });
  if (tampered.status() !== 400) throw new Error(`Tampered imported keyframes were accepted (${tampered.status()}).`);
  const afterRejected = await (await page.request.get(`/api/projects/${projectId}`)).json() as typeof importedState;
  if (afterRejected.project.revision !== importedState.project.revision || afterRejected.project.snapshot.animation.importedClips.length !== 1) throw new Error("Rejected import changed the project revision or clips.");
  if (createHash("sha256").update(await (await page.request.get(fileUrl)).body()).digest("hex") !== sourceHash) throw new Error("Imported animation changed original model bytes.");
  console.log(`IMPORTED_CLIP_RELOAD_GATE_PASS: GLB mapping, private SHA-256 ${importedSourceHash}, reload, rejected missing/tampered imports, unchanged revision/source hash, pose difference ${importedDifference.toFixed(2)}.`);

  await page.getByRole("list", { name: "Imported clips" }).getByRole("button", { name: "Imported Rise" }).click();
  await page.getByLabel("Imported speed").fill("1.25");
  await page.getByRole("combobox", { name: "Imported loop" }).selectOption("pingpong");
  await page.getByRole("list", { name: "Project clips" }).getByRole("button", { name: "Edited Rise", exact: true }).click();
  await page.getByRole("region", { name: "Selected clip" }).getByRole("checkbox", { name: "Enabled" }).check();
  await page.getByRole("list", { name: "Project clips" }).getByRole("button", { name: "Add to sequence" }).click();
  await page.getByRole("list", { name: "Imported clips" }).getByRole("button", { name: "Add to sequence" }).click();
  const sequencePanel = page.getByRole("region", { name: "Clip sequence" });
  await sequencePanel.getByRole("spinbutton", { name: "Segment 2 overlap" }).fill("0.2");
  await sequencePanel.getByRole("spinbutton", { name: "Segment 2 source offset" }).fill("0.1");
  await sequencePanel.getByRole("spinbutton", { name: "Segment 2 weight" }).fill("0.75");
  const overlapBefore = await sequencePanel.getByRole("spinbutton", { name: "Segment 2 overlap" }).inputValue();
  if (Number(overlapBefore) !== 0.2) throw new Error(`Sequence overlap changed before reorder: ${overlapBefore}.`);
  await sequencePanel.getByRole("button", { name: "Preview sequence" }).click();
  await sequencePanel.getByRole("slider", { name: "Scrub sequence" }).fill("0.05");
  await page.waitForTimeout(200);
  const sequenceStart = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  await sequencePanel.getByRole("slider", { name: "Scrub sequence" }).fill("0.95");
  await page.waitForTimeout(200);
  const sequenceEnd = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  const sequenceDifference = await meanPixelDifference(sequenceStart, sequenceEnd);
  if (sequenceDifference < 0.5) throw new Error(`Sequence scrub did not visibly change the pose (${sequenceDifference.toFixed(2)}).`);
  await sequencePanel.getByRole("slider", { name: "Scrub sequence" }).fill("0");
  await sequencePanel.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(250);
  await sequencePanel.getByRole("button", { name: "Pause", exact: true }).click();
  await sequencePanel.getByRole("button", { name: "Move segment 2 earlier" }).click();
  const overlapAfter = await sequencePanel.getByRole("spinbutton", { name: "Segment 2 overlap" }).inputValue();
  if (Number(overlapAfter) !== 0.2) throw new Error(`Sequence overlap changed during reorder: ${overlapAfter}.`);
  await sequencePanel.getByRole("checkbox", { name: "Loop sequence" }).check();
  await page.getByRole("button", { name: "Save project" }).click();
  await page.locator(".save-state").getByText("Saved").waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Animate step" }).waitFor();
  const sequenced = await (await page.request.get(`/api/projects/${projectId}`)).json() as { project: { snapshot: { animation: { importedClips: Array<{ speed: number; loop: string }>; sequence: Array<{ clipId: string; overlapSeconds: number; sourceOffsetSeconds: number; weight: number }>; sequenceLoop: boolean } } } };
  const savedSequence = sequenced.project.snapshot.animation;
  if (savedSequence.sequence.length !== 2 || savedSequence.sequence[0].clipId !== attachedImport.id || savedSequence.sequence[1].overlapSeconds !== 0.2 || savedSequence.sequence[1].sourceOffsetSeconds !== 0 || savedSequence.sequence[0].sourceOffsetSeconds !== 0.1 || savedSequence.sequence[0].weight !== 0.75 || !savedSequence.sequenceLoop) throw new Error(`Sequence order, overlap, offset, weight, or loop did not survive reload: ${JSON.stringify({ expectedImportId: attachedImport.id, sequence: savedSequence.sequence, loop: savedSequence.sequenceLoop })}`);
  if (savedSequence.importedClips[0].speed !== 1.25 || savedSequence.importedClips[0].loop !== "pingpong") throw new Error("Imported clip timing did not survive sequence reload.");
  await sequencePanel.getByRole("button", { name: "Preview sequence" }).click();
  await sequencePanel.getByRole("slider", { name: "Scrub sequence" }).fill("0.05");
  await page.waitForTimeout(200);
  const reloadedStart = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  await sequencePanel.getByRole("slider", { name: "Scrub sequence" }).fill("0.95");
  await page.waitForTimeout(200);
  const reloadedEnd = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  const reloadedDifference = await meanPixelDifference(reloadedStart, reloadedEnd);
  if (reloadedDifference < 0.5) throw new Error(`Reloaded sequence did not visibly change pose (${reloadedDifference.toFixed(2)}).`);
  await sequencePanel.getByRole("slider", { name: "Scrub sequence" }).fill("0");
  await sequencePanel.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(250);
  await sequencePanel.getByRole("button", { name: "Pause", exact: true }).click();
  const importedAfterSequence = await (await import("node:fs/promises")).readFile(join(assetRoot, ...attachedImport.sourceStorageKey.split("/")));
  if (createHash("sha256").update(importedAfterSequence).digest("hex") !== importedSourceHash) throw new Error("Sequencing changed private imported source bytes.");
  if (createHash("sha256").update(await (await page.request.get(fileUrl)).body()).digest("hex") !== sourceHash) throw new Error("Sequencing changed original model bytes.");
  console.log(`CLIP_SEQUENCE_RELOAD_GATE_PASS: crossfade controls, reorder, play/scrub pose differences ${sequenceDifference.toFixed(2)} and ${reloadedDifference.toFixed(2)} after reload, imported timing, and unchanged source hashes.`);

  const timelinePanel = page.getByRole("region", { name: "Visual timelines" });
  await timelinePanel.getByRole("button", { name: "Add timeline" }).click();
  await timelinePanel.getByLabel("Timeline name").fill("Entrance motion");
  await timelinePanel.getByLabel("Timeline target class").selectOption("part");
  await timelinePanel.getByLabel("Timeline target", { exact: true }).selectOption(selectedPartId);
  await timelinePanel.getByLabel("Timeline property").selectOption("position.x");
  await timelinePanel.getByRole("button", { name: "Add track" }).click();
  await timelinePanel.getByLabel("Track 1 keyframe 2 value").fill("2");
  await timelinePanel.getByRole("slider", { name: "Scrub timeline" }).fill("0");
  await page.waitForTimeout(200);
  const timelineStart = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  await timelinePanel.getByRole("slider", { name: "Scrub timeline" }).fill("1");
  await page.waitForTimeout(200);
  const timelineEnd = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  const timelineDifference = await meanPixelDifference(timelineStart, timelineEnd);
  if (timelineDifference < 0.5) throw new Error(`GSAP timeline scrub did not change the model (${timelineDifference.toFixed(2)}).`);
  await timelinePanel.getByLabel("Timeline trigger", { exact: true }).selectOption("click");
  await timelinePanel.getByLabel("Timeline trigger part").selectOption(selectedPartId);
  await page.getByRole("button", { name: "Save project" }).click();
  await page.locator(".save-state").getByText("Saved").waitFor();
  const savedTimelineState = await (await page.request.get(`/api/projects/${projectId}`)).json() as { project: { revision: number; snapshot: { animation: { timelines: Array<{ id: string; name: string; trigger: { type: string; targetId: string }; tracks: Array<{ targetId: string; keyframes: Array<{ value: number }> }> }> } } } };
  const [savedTimeline] = savedTimelineState.project.snapshot.animation.timelines;
  if (savedTimeline.name !== "Entrance motion" || savedTimeline.trigger.type !== "click" || savedTimeline.trigger.targetId !== selectedPartId || savedTimeline.tracks[0]?.keyframes[1]?.value !== 2) throw new Error("Timeline target, trigger, or keyframe did not persist.");
  const unsafeTimeline = await page.request.patch(`/api/projects/${projectId}`, { data: { action: "save", expectedRevision: savedTimelineState.project.revision, activeStep: "Animate", snapshot: { ...savedTimelineState.project.snapshot, animation: { ...savedTimelineState.project.snapshot.animation, timelines: [{ ...savedTimeline, tracks: [{ ...savedTimeline.tracks[0], property: "eval", script: "globalThis.unsafe = true" }] }] } } } });
  if (unsafeTimeline.status() !== 400) throw new Error("Executable timeline payload was accepted.");
  await page.reload();
  await timelinePanel.getByRole("button", { name: "Entrance motion" }).click();
  await timelinePanel.getByRole("slider", { name: "Scrub timeline" }).fill("0");
  await page.waitForTimeout(200);
  const reloadedTimelineStart = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  await timelinePanel.getByRole("slider", { name: "Scrub timeline" }).fill("1");
  await page.waitForTimeout(200);
  const reloadedTimelineEnd = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  const reloadedTimelineDifference = await meanPixelDifference(reloadedTimelineStart, reloadedTimelineEnd);
  if (reloadedTimelineDifference < 0.5) throw new Error(`Reloaded GSAP timeline did not change the model (${reloadedTimelineDifference.toFixed(2)}).`);
  await timelinePanel.getByRole("slider", { name: "Scrub timeline" }).fill("0");
  await page.waitForTimeout(150);
  const beforeTimelineClick = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
  const timelineCanvas = page.locator(".project-editor-preview canvas").first();
  const timelineCanvasBox = await timelineCanvas.boundingBox();
  if (!timelineCanvasBox) throw new Error("Timeline preview canvas is missing.");
  let clickedTimeline = false;
  for (const [x, y] of [[0.48, 0.52], [0.5, 0.5], [0.43, 0.57], [0.55, 0.45], [0.4, 0.6]]) {
    await timelineCanvas.click({ position: { x: timelineCanvasBox.width * x, y: timelineCanvasBox.height * y } });
    await page.waitForTimeout(100);
    const afterTimelineClick = await page.getByRole("region", { name: "Project preview" }).locator(".viewer-stage").screenshot();
    if (await meanPixelDifference(beforeTimelineClick, afterTimelineClick) > 0.5) { clickedTimeline = true; break; }
  }
  if (!clickedTimeline) throw new Error("Click trigger did not move the model in the timeline preview.");
  await timelinePanel.getByRole("slider", { name: "Scrub timeline" }).fill("0");
  await timelinePanel.getByRole("button", { name: "Play timeline" }).click();
  await page.waitForTimeout(200);
  if (Number((await timelinePanel.locator("output").textContent())?.split(" ")[0]) < 1.9) throw new Error("Reduced-motion timeline playback did not jump to its final state.");
  if (createHash("sha256").update(await (await page.request.get(fileUrl)).body()).digest("hex") !== sourceHash) throw new Error("Timeline edits changed original model bytes.");
  console.log(`VISUAL_TIMELINE_RELOAD_GATE_PASS: typed click track and keyframe persisted; scrub differences ${timelineDifference.toFixed(2)} and ${reloadedTimelineDifference.toFixed(2)} after reload; click trigger, reduced motion, and unsafe payload checks passed.`);

  await page.getByRole("button", { name: "Export step" }).click();
  const exportPanel = page.getByRole("region", { name: "Export controls" });
  await exportPanel.getByRole("button", { name: "Create export manifest" }).click();
  await exportPanel.getByRole("link", { name: "Download manifest" }).waitFor();
  const exportJobsResponse = await page.request.get(`/api/projects/${projectId}/exports`);
  if (exportJobsResponse.status() !== 200) throw new Error("Owner could not list export jobs.");
  const exportJobs = await exportJobsResponse.json() as { jobs: Array<{ id: string; status: string; projectRevision: number }> };
  const [readyExport] = exportJobs.jobs;
  if (readyExport.status !== "ready") throw new Error("Validated export was not marked ready.");
  const manifestResponse = await page.request.get(`/api/projects/${projectId}/exports/${readyExport.id}/manifest`);
  if (manifestResponse.status() !== 200) throw new Error("Owner could not download the export manifest.");
  const manifestText = await manifestResponse.text();
  const manifest = JSON.parse(manifestText) as { projectRevision: number; modelPath: string; files: Array<{ path: string }>; warnings: string[] };
  if (manifest.projectRevision !== readyExport.projectRevision || manifest.modelPath !== "assets/model.glb" || !manifest.files.some((file) => file.path === manifest.modelPath)) throw new Error("Export manifest did not freeze the project revision and retained model.");
  if (/sourceStorageKey|postgres(?:ql)?:\/\/|BETTER_AUTH_SECRET|DATABASE_URL|[a-z]:\\/i.test(manifestText)) throw new Error("Export manifest exposed private or machine-local state.");
  const [{ sha256: versionSha }] = (await client.query<{ sha256: string }>("select sha256 from asset_versions where id = $1", [derived.id])).rows;
  await client.query("update asset_versions set sha256 = $2 where id = $1", [derived.id, "0".repeat(64)]);
  try {
    await exportPanel.getByRole("button", { name: "Create export manifest" }).click();
    await exportPanel.getByText(/failed · SOURCE_UNAVAILABLE/).waitFor();
    const failedJobs = await (await page.request.get(`/api/projects/${projectId}/exports`)).json() as typeof exportJobs;
    const [failedExport] = failedJobs.jobs;
    if (failedExport.status !== "failed" || (await page.request.get(`/api/projects/${projectId}/exports/${failedExport.id}/manifest`)).status() !== 404) throw new Error("Failed export published a manifest artifact.");
  } finally { await client.query("update asset_versions set sha256 = $2 where id = $1", [derived.id, versionSha]); }
  await exportPanel.getByRole("button", { name: "Retry export" }).click();
  await exportPanel.getByRole("link", { name: "Download manifest" }).nth(1).waitFor();
  const retriedJobs = await (await page.request.get(`/api/projects/${projectId}/exports`)).json() as typeof exportJobs;
  if (retriedJobs.jobs[0]?.status !== "ready" || retriedJobs.jobs[0].id === readyExport.id) throw new Error("Failed export did not become ready on retry.");
  if (createHash("sha256").update(await (await page.request.get(fileUrl)).body()).digest("hex") !== sourceHash) throw new Error("Export changed original source bytes.");
  console.log(`EXPORT_MANIFEST_RETRY_GATE_PASS: owner downloaded portable revision ${readyExport.projectRevision}, missing source metadata failed without artifact, retry succeeded, and original source SHA-256 remained ${sourceHash}.`);

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
