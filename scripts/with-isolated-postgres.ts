import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Client } from "pg";
import { normalizeDatabaseUrl } from "../src/db/connection-url";

if (existsSync(".env")) process.loadEnvFile(".env");
const mainUrl = process.env.DATABASE_URL;
if (!mainUrl) throw new Error("DATABASE_URL is required to provision an isolated test database.");
const name = `yggdrasil_e2e_${randomBytes(6).toString("hex")}`;
const url = new URL(normalizeDatabaseUrl(mainUrl));
url.pathname = `/${name}`;
const testUrl = url.toString();
const admin = new Client({ connectionString: normalizeDatabaseUrl(mainUrl) });
const args = process.argv.slice(2);
if (!args.length) throw new Error("Pass a pnpm command to run against the isolated database.");

async function run(commandArgs: string[], env: NodeJS.ProcessEnv) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(command, commandArgs, { env, stdio: "inherit", windowsHide: true, shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`${commandArgs.join(" ")} failed with exit code ${exitCode}`);
}

await admin.connect();
let created = false;
try {
  await admin.query(`CREATE DATABASE ${name}`);
  created = true;
  console.log(`ISOLATED_DATABASE_CREATED: ${name}`);
  const env = { ...process.env, DATABASE_URL: testUrl, YGGDRASIL_E2E_DATABASE_URL: testUrl };
  await run(["db:migrate"], env);
  await run(args, { ...env, DATABASE_URL: mainUrl });
} finally {
  if (created) {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    console.log(`ISOLATED_DATABASE_REMOVED: ${name}`);
  }
  await admin.end();
}
