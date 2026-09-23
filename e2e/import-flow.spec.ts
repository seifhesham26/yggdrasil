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

test("owner imports an animated glTF and inspects its live report", async ({ page }) => {
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
});
