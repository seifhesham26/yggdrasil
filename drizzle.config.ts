import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";
import { normalizeDatabaseUrl } from "./src/db/connection-url";

// Drizzle Kit runs outside Next.js, so it must load the local .env itself.
if (existsSync(".env")) loadEnvFile(".env");

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // `generate` only needs the schema. Migrations require DATABASE_URL and
  // fail explicitly in Drizzle Kit if it is not supplied.
  dbCredentials: {
    url: normalizeDatabaseUrl(process.env.DATABASE_URL ?? ""),
  },
});
