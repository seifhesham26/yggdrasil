import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { createGltfFixture } from "../src/test/fixtures/create-gltf-fixture";

const email = process.env.YGGDRASIL_E2E_OWNER_EMAIL;
const name = process.env.YGGDRASIL_E2E_OWNER_NAME;
const password = process.env.YGGDRASIL_E2E_OWNER_PASSWORD;
const assetRoot = process.env.YGGDRASIL_E2E_ASSET_ROOT;
const databaseUrl = process.env.YGGDRASIL_E2E_DATABASE_URL ?? process.env.DATABASE_URL;

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

test("owner imports, applies, compares, reverts, retries, and reopens optimization", async ({ page }) => {
  test.skip(!email || !name || !password || !databaseUrl, "Set YGGDRASIL_E2E_DATABASE_URL or YGGDRASIL_E2E_USE_MAIN_DATABASE=1");
  test.setTimeout(120_000);

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
    page.waitForResponse((candidate) => candidate.url().endsWith("/api/assets/import")),
    page.getByRole("button", { name: "Import asset" }).click(),
  ]);
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByText("Import complete")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("1 mesh")).toBeVisible();
  await expect(page.getByText("1 animation")).toBeVisible();

  await page.getByRole("link", { name: "Open asset report" }).click();
  await expect(page.getByRole("img", { name: "3D model preview" })).toBeVisible();
  await expect(page.getByText("No destructive changes applied", { exact: false })).toBeVisible();

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
});
