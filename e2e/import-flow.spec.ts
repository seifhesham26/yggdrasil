import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";
import { zipSync } from "fflate";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createGltfFixture } from "../src/test/fixtures/create-gltf-fixture";

const email = process.env.YGGDRASIL_E2E_OWNER_EMAIL;
const name = process.env.YGGDRASIL_E2E_OWNER_NAME;
const password = process.env.YGGDRASIL_E2E_OWNER_PASSWORD;
const assetRoot = process.env.YGGDRASIL_E2E_ASSET_ROOT;
const isolatedDatabaseUrl = process.env.YGGDRASIL_E2E_DATABASE_URL;
const databaseUrl = isolatedDatabaseUrl && isolatedDatabaseUrl !== process.env.DATABASE_URL ? isolatedDatabaseUrl : undefined;

test.beforeAll(async () => {
  if (!email || !name || !password || !databaseUrl) return;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ users: string; assets: string }>(
      'select (select count(*) from "user") as users, (select count(*) from assets) as assets',
    );
    if (result.rows[0].users !== "0" || result.rows[0].assets !== "0") {
      throw new Error("E2E import requires an empty database; existing owner/assets were not touched.");
    }
  } finally {
    await client.end();
  }
});

test.afterAll(async () => {
  if (!email || !name || !databaseUrl) return;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Cascading foreign keys remove only assets created by this throwaway owner.
    await client.query('delete from "user" where email = $1 and name = $2', [email, name]);
  } finally {
    await client.end();
  }
  if (assetRoot) {
    const target = await realpath(assetRoot);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("yggdrasil-e2e-")) {
      throw new Error("Refusing to remove an unexpected E2E asset folder.");
    }
    await rm(target, { recursive: true, force: true });
  }
});

test("owner imports models, reopens previews, and completes optimization workflow", async ({ page, request }) => {
  test.skip(!email || !name || !password || !databaseUrl, "Set YGGDRASIL_E2E_DATABASE_URL to a separate empty PostgreSQL database");
  test.setTimeout(180_000);

  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Create your studio account." })).toBeVisible();
  await page.getByLabel("Display name").fill(name!);
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await expect(page).toHaveURL(/\/library$/);

  const { model, binary } = createGltfFixture();
  await page.getByLabel("Choose model files").setInputFiles([
    { name: model.relativePath, mimeType: "model/gltf+json", buffer: Buffer.from(model.bytes) },
    { name: binary.relativePath, mimeType: "application/octet-stream", buffer: Buffer.from(binary.bytes) },
  ]);
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.url().endsWith("/api/assets/import/jobs")),
    page.getByRole("button", { name: "Import asset" }).click(),
  ]);
  expect(response.status(), await response.text()).toBe(202);
  await expect(page.getByText("Select a model variant")).toBeVisible();
  await page.getByRole("button", { name: "Use triangle.gltf" }).click();
  await expect(page.getByText("Import complete")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("1 mesh")).toBeVisible();
  await expect(page.getByText("1 animation")).toBeVisible();

  await page.getByRole("link", { name: "Open asset report" }).click();
  await expect(page.getByRole("img", { name: "3D model preview" })).toBeVisible();
  await expect(page.getByText("No destructive changes applied", { exact: false })).toBeVisible();
  await expect(page.getByText("Attribution unknown", { exact: false })).toBeVisible();

  const assetId = new URL(page.url()).pathname.split("/").at(-1)!;
  const endpoint = `/api/assets/${assetId}/optimization`;
  const initial = await (await page.request.get(`${endpoint}?view=history`)).json();
  const original = initial.versions[0];
  const sourceURL = `/api/assets/${assetId}/file?key=${encodeURIComponent(original.storageKey)}`;
  const sourceBefore = await (await page.request.get(sourceURL)).body();
  const preview = page.getByRole("region", { name: "Model preview", exact: true });
  await expect(preview).toHaveAttribute("data-version-id", original.id);
  await expect(page.getByText(/Quality risk: low/)).toBeVisible();
  const appliedResponse = page.waitForResponse((candidate) => candidate.url().endsWith(endpoint) && candidate.request().method() === "POST");
  await page.getByRole("button", { name: "Approve normalization" }).click();
  const applied = await appliedResponse;
  expect(applied.status(), await applied.text()).toBe(200);
  const derived = await applied.json();
  await expect(preview).toHaveAttribute("data-version-id", derived.id);
  await expect(preview.getByRole("img", { name: "3D model preview" })).toBeVisible();
  const derivedURL = `/api/assets/${assetId}/file?key=${encodeURIComponent(derived.storageKey)}`;
  const derivedFile = await page.request.get(derivedURL);
  expect(derivedFile.status()).toBe(200);
  expect((await derivedFile.body()).length).toBe(derived.byteSize);
  await page.getByLabel("Compare with").selectOption(original.id);
  await expect(page.getByRole("table", { name: "Version comparison" })).toContainText(derived.byteSize.toLocaleString());
  await expect(page.getByRole("region", { name: "Comparison preview" }).getByRole("img", { name: "3D model preview" })).toBeVisible();

  // Cause one real transactional failure only for this throwaway asset. Restore
  // the database before retry, without changing any source or retained binary.
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE FUNCTION e2e_fail_promotion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.asset_id = '${assetId}'::uuid THEN RAISE EXCEPTION 'E2E temporary promotion failure'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER e2e_fail_promotion BEFORE INSERT ON scene_analyses FOR EACH ROW EXECUTE FUNCTION e2e_fail_promotion();`);
    const failedResponse = page.waitForResponse((candidate) => candidate.url().endsWith(endpoint) && candidate.request().method() === "POST");
    await page.getByRole("button", { name: "Approve normalization" }).click();
    expect((await failedResponse).status()).toBe(422);
    await expect(page.getByRole("button", { name: "Retry last failed operation" })).toBeVisible();
  } finally {
    await client.query("DROP TRIGGER IF EXISTS e2e_fail_promotion ON scene_analyses; DROP FUNCTION IF EXISTS e2e_fail_promotion();");
    await client.end();
  }
  const afterFailure = await (await page.request.get(`${endpoint}?view=history`)).json();
  expect(afterFailure.currentVersionId).toBe(derived.id);
  expect(afterFailure.versions).toHaveLength(2);
  const failedAttempt = afterFailure.attempts.at(-1);
  expect(failedAttempt).toMatchObject({ status: "failed", parentVersionId: derived.id });

  const versions = page.getByRole("list", { name: "Optimization version history" });
  await versions.getByRole("listitem").filter({ hasText: "original" }).getByRole("button", { name: "Use this version" }).click();
  await expect(preview).toHaveAttribute("data-version-id", original.id);
  await page.reload();
  await expect(preview).toHaveAttribute("data-version-id", original.id);
  await expect(versions.getByRole("listitem")).toHaveCount(2);
  const retryResponse = page.waitForResponse((candidate) => candidate.url().endsWith(endpoint) && candidate.request().method() === "POST");
  await page.getByRole("button", { name: "Retry last failed operation" }).click();
  const retry = await retryResponse;
  expect(retry.status(), await retry.text()).toBe(200);
  const retried = await retry.json();
  expect(retried.parentVersionId).toBe(derived.id);
  await expect(preview).toHaveAttribute("data-version-id", retried.id);
  await page.reload();
  await expect(preview).toHaveAttribute("data-version-id", retried.id);
  await expect(versions.getByRole("listitem")).toHaveCount(3);
  const finalHistory = await (await page.request.get(`${endpoint}?view=history`)).json();
  expect(finalHistory.attempts.at(-1)).toMatchObject({ retryOf: failedAttempt.id, versionId: retried.id, status: "succeeded" });
  expect(await (await page.request.get(sourceURL)).body()).toEqual(sourceBefore);
  expect((await page.request.get(derivedURL)).status()).toBe(200);

  const fixtureDir = resolve("src/test/fixtures/phase-1");
  const fixtures = [
    { model: "cube.fbx", files: ["cube.fbx"], triangles: "12", warning: "FBX conversion uses Three.js FBXLoader" },
    { model: "painted-panel.obj", files: ["painted-panel.obj", "painted-panel.mtl", "checker.png"], triangles: "2", warning: "OBJ material references are retained" },
  ];
  for (const fixture of fixtures) {
    await test.step(`import and reopen ${fixture.model}`, async () => {
      await page.goto("/library");
      await page.getByLabel("Choose model files").setInputFiles(fixture.files.map((file) => join(fixtureDir, file)));
      const [importResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().endsWith("/api/assets/import/jobs")),
        page.getByRole("button", { name: "Import asset" }).click(),
      ]);
      expect(importResponse.status(), await importResponse.text()).toBe(202);
      const { jobId } = await importResponse.json() as { jobId: string };
      await expect(page.getByText("Select a model variant")).toBeVisible();
      await page.getByRole("button", { name: `Use ${fixture.model}` }).click();
      await expect(page.getByText("Import complete")).toBeVisible();
      const { assetId: importedId } = await (await page.request.get(`/api/assets/import/jobs/${jobId}`)).json() as { assetId: string };
      await page.getByRole("link", { name: "Open asset report" }).click();
      await expect(page).toHaveURL(new RegExp(`/assets/${importedId}$`));
      await expect(page.locator(".analysis-counts div").filter({ hasText: "Triangles" })).toContainText(fixture.triangles);
      await expect(page.getByText(fixture.warning, { exact: false })).toBeVisible();
      await expect(page.getByRole("img", { name: "3D model preview" })).toBeVisible();
      await expect(page.getByRole("progressbar", { name: "Loading model" })).toBeHidden({ timeout: 30_000 });

      const fileUrl = (file: string) => `/api/assets/${importedId}/file?key=${encodeURIComponent(`assets/${importedId}/source/${file}`)}`;
      for (const file of fixture.files) {
        const source = await page.request.get(fileUrl(file));
        expect(source.status()).toBe(200);
        expect(await source.body()).toEqual(await readFile(join(fixtureDir, file)));
      }
      const normalized = await page.request.get(fileUrl(`__normalized/${fixture.model.replace(/\.[^.]+$/, ".glb")}`));
      expect(normalized.status()).toBe(200);
      expect((await normalized.body()).subarray(0, 4).toString()).toBe("glTF");
      expect((await request.get(fileUrl(fixture.model))).status()).toBe(401);

      await page.reload();
      await expect(page.locator(".analysis-counts div").filter({ hasText: "Triangles" })).toContainText(fixture.triangles);
      await expect(page.getByRole("progressbar", { name: "Loading model" })).toBeHidden({ timeout: 30_000 });
      expect(await (await page.request.get(fileUrl(fixture.model))).body()).toEqual(await readFile(join(fixtureDir, fixture.model)));
    });
  }

  await test.step("import and reopen a ZIP with its unchanged archive", async () => {
    const archive = zipSync({ "folder/triangle.gltf": model.bytes, "folder/triangle.bin": binary.bytes });
    await page.goto("/library");
    await page.getByLabel("Choose ZIP").setInputFiles({ name: "triangle.zip", mimeType: "application/zip", buffer: Buffer.from(archive) });
    const [importResponse] = await Promise.all([
      page.waitForResponse((candidate) => candidate.url().endsWith("/api/assets/import/jobs")),
      page.getByRole("button", { name: "Import asset" }).click(),
    ]);
    expect(importResponse.status(), await importResponse.text()).toBe(202);
    const { jobId } = await importResponse.json() as { jobId: string };
    await expect(page.getByText("Select a model variant")).toBeVisible();
    await page.getByRole("button", { name: "Use folder/triangle.gltf" }).click();
    await expect(page.getByText("Import complete")).toBeVisible();
    const { assetId: zipAssetId } = await (await page.request.get(`/api/assets/import/jobs/${jobId}`)).json() as { assetId: string };
    await page.getByRole("link", { name: "Open asset report" }).click();
    await expect(page).toHaveURL(new RegExp(`/assets/${zipAssetId}$`));
    await expect(page.locator(".analysis-counts div").filter({ hasText: "Triangles" })).toContainText("1");
    const archiveFile = `/api/assets/${zipAssetId}/file?key=${encodeURIComponent(`assets/${zipAssetId}/source/triangle.zip`)}`;
    expect(await (await page.request.get(archiveFile)).body()).toEqual(Buffer.from(archive));
    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Loading model" })).toBeHidden({ timeout: 30_000 });
    expect(await (await page.request.get(archiveFile)).body()).toEqual(Buffer.from(archive));
  });

  await test.step("stream and reopen a 64 MiB archive with its original hash", async () => {
    const payload = randomBytes(64 * 1024 * 1024);
    const archive = zipSync({ "large/triangle.gltf": model.bytes, "large/triangle.bin": binary.bytes, "large/payload.bin": payload }, { level: 0 });
    const expectedHash = createHash("sha256").update(archive).digest("hex");
    console.log(`LARGE_ARCHIVE_SHA256=${expectedHash}`);
    const fixtureRoot = await mkdtemp(join(tmpdir(), "yggdrasil-large-fixture-"));
    const archivePath = join(fixtureRoot, "large.zip");
    try {
    await writeFile(archivePath, archive);
    await page.goto("/library");
    await page.getByLabel("Choose ZIP").setInputFiles(archivePath);
    const [uploadResponse] = await Promise.all([
      page.waitForResponse((candidate) => candidate.url().endsWith("/api/assets/import/jobs")),
      page.getByRole("button", { name: "Import asset" }).click(),
    ]);
    expect(uploadResponse.status(), await uploadResponse.text()).toBe(202);
    const { jobId } = await uploadResponse.json() as { jobId: string };
    await expect(page.getByText("Select a model variant")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Use large/triangle.gltf" }).click();
    await expect(page.getByText("Import complete")).toBeVisible({ timeout: 90_000 });
    const completed = await (await page.request.get(`/api/assets/import/jobs/${jobId}`)).json() as { assetId: string; phase: string };
    expect(completed.phase).toBe("completed");
    const archiveUrl = `/api/assets/${completed.assetId}/file?key=${encodeURIComponent(`assets/${completed.assetId}/source/large.zip`)}`;
    const storedHash = async () => {
      const hash = createHash("sha256");
      for (let start = 0; start < archive.byteLength; start += 8 * 1024 * 1024) {
        const end = Math.min(archive.byteLength - 1, start + 8 * 1024 * 1024 - 1);
        const part = await page.request.get(archiveUrl, { headers: { Range: `bytes=${start}-${end}` } });
        expect(part.status()).toBe(206);
        hash.update(await part.body());
      }
      return hash.digest("hex");
    };
    expect(await storedHash()).toBe(expectedHash);
    await page.getByRole("link", { name: "Open asset report" }).click();
    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Loading model" })).toBeHidden({ timeout: 30_000 });
    expect(await storedHash()).toBe(expectedHash);
    } finally {
      const target = await realpath(fixtureRoot);
      if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("yggdrasil-large-fixture-")) throw new Error("Refusing to remove an unexpected large-fixture folder.");
      await rm(target, { recursive: true, force: true });
    }
  });

  await test.step("select and reopen one model from an ambiguous package", async () => {
    await page.goto("/library");
    await page.getByLabel("Choose model files").setInputFiles([
      { name: "low/model.gltf", mimeType: "model/gltf+json", buffer: Buffer.from(model.bytes) },
      { name: "low/triangle.bin", mimeType: "application/octet-stream", buffer: Buffer.from(binary.bytes) },
      { name: "high/model.gltf", mimeType: "model/gltf+json", buffer: Buffer.from(model.bytes) },
      { name: "high/triangle.bin", mimeType: "application/octet-stream", buffer: Buffer.from(binary.bytes) },
      { name: "LICENSE.txt", mimeType: "text/plain", buffer: Buffer.from("CC0 fixture attribution") },
    ]);
    const [uploadResponse] = await Promise.all([
      page.waitForResponse((candidate) => candidate.url().endsWith("/api/assets/import/jobs")),
      page.getByRole("button", { name: "Import asset" }).click(),
    ]);
    expect(uploadResponse.status(), await uploadResponse.text()).toBe(202);
    const { jobId: variantJobId } = await uploadResponse.json() as { jobId: string };
    await expect(page.getByText("Select a model variant")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Model variants")).toContainText("low/triangle.bin");
    await expect(page.getByLabel("Model variants")).toContainText("high/triangle.bin");
    await expect(page.getByLabel("Model variants")).toContainText("CC0 fixture attribution");
    const pending = await (await page.request.get(`/api/assets/import/jobs/${variantJobId}`)).json();
    expect(pending).toMatchObject({ phase: "received", selectedModelPath: null });
    await page.getByLabel("Model variants").getByRole("button", { name: "Use high/model.gltf" }).click();
    await expect(page.getByText("Import complete")).toBeVisible({ timeout: 30_000 });
    const completed = await (await page.request.get(`/api/assets/import/jobs/${variantJobId}`)).json();
    expect(completed).toMatchObject({ phase: "completed", selectedModelPath: "high/model.gltf" });
    await page.getByRole("link", { name: "Open asset report" }).click();
    const selectedAssetId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(page.getByRole("link", { name: "LICENSE.txt" })).toBeVisible();
    await expect(page.getByText("Attribution provided, not verified", { exact: false })).toBeVisible();
    const history = await (await page.request.get(`/api/assets/${selectedAssetId}/optimization?view=history`)).json();
    expect(history.versions[0].storageKey).toBe(`assets/${selectedAssetId}/source/high/model.gltf`);
    for (const file of ["low/model.gltf", "low/triangle.bin", "high/model.gltf", "high/triangle.bin", "LICENSE.txt"]) {
      expect((await page.request.get(`/api/assets/${selectedAssetId}/file?key=${encodeURIComponent(`assets/${selectedAssetId}/source/${file}`)}`)).status()).toBe(200);
    }
    const license = await (await page.request.get(`/api/assets/${selectedAssetId}/file?key=${encodeURIComponent(`assets/${selectedAssetId}/source/LICENSE.txt`)}`)).body();
    expect(license.toString()).toBe("CC0 fixture attribution");
    const beforeSwitch = await (await page.request.get(`/api/assets/${selectedAssetId}/file?key=${encodeURIComponent(`assets/${selectedAssetId}/source/low/model.gltf`)}`)).body();
    await page.getByRole("button", { name: "Use low/model.gltf" }).click();
    await expect(page.getByRole("region", { name: "Model preview", exact: true })).not.toHaveAttribute("data-version-id", history.versions[0].id);
    await page.reload();
    await expect(page.getByText("low/model.gltf Current preview")).toBeVisible();
    const afterSwitch = await (await page.request.get(`/api/assets/${selectedAssetId}/file?key=${encodeURIComponent(`assets/${selectedAssetId}/source/low/model.gltf`)}`)).body();
    expect(afterSwitch).toEqual(beforeSwitch);
    const switched = await (await page.request.get(`/api/assets/${selectedAssetId}/optimization?view=history`)).json();
    expect(switched.versions.map((version: { operation: string }) => version.operation)).toEqual(["original", "variant"]);
    expect((await page.request.get(`/api/assets/${selectedAssetId}/file?key=${encodeURIComponent(switched.versions[1].storageKey)}`)).status()).toBe(200);
  });
});
