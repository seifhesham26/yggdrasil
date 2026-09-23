import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");
const testDatabaseUrl = process.env.YGGDRASIL_E2E_DATABASE_URL;
const useMainDatabase = process.env.YGGDRASIL_E2E_USE_MAIN_DATABASE === "1";
if (testDatabaseUrl && testDatabaseUrl === process.env.DATABASE_URL && !useMainDatabase) {
  throw new Error("Set YGGDRASIL_E2E_USE_MAIN_DATABASE=1 to explicitly test against the main DATABASE_URL.");
}
const acceptanceRun = Boolean(testDatabaseUrl || useMainDatabase);
const baseURL = acceptanceRun ? "http://127.0.0.1:3100" : "http://127.0.0.1:3000";
const testAssetRoot = acceptanceRun ? mkdtempSync(join(tmpdir(), "yggdrasil-e2e-")) : undefined;
if (acceptanceRun) {
  process.env.YGGDRASIL_E2E_OWNER_EMAIL = testDatabaseUrl && !useMainDatabase
    ? "e2e-owner@example.test"
    : process.env.YGGDRASIL_OWNER_EMAIL;
  process.env.YGGDRASIL_E2E_OWNER_NAME = `E2E Owner ${randomBytes(8).toString("hex")}`;
  process.env.YGGDRASIL_E2E_OWNER_PASSWORD = randomBytes(24).toString("base64url");
  process.env.YGGDRASIL_E2E_ASSET_ROOT = testAssetRoot;
}

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL,
  },
  webServer: {
    command: acceptanceRun ? "pnpm dev --port 3100" : "pnpm dev",
    url: baseURL,
    reuseExistingServer: !acceptanceRun && !process.env.CI,
    env: acceptanceRun ? {
      DATABASE_URL: testDatabaseUrl ?? process.env.DATABASE_URL!,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      BETTER_AUTH_URL: baseURL,
      YGGDRASIL_OWNER_EMAIL: process.env.YGGDRASIL_E2E_OWNER_EMAIL!,
      YGGDRASIL_ASSET_ROOT: testAssetRoot!,
    } : undefined,
  },
});
