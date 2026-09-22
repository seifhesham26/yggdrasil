import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // `generate` only needs the schema. Migrations require DATABASE_URL and
  // fail explicitly in Drizzle Kit if it is not supplied.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
