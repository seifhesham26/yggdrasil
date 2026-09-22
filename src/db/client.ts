import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { serverEnv } from "@/lib/env/server";
import * as schema from "@/db/schema";

type Database = ReturnType<typeof createDatabase>;

function createDatabase() {
  const sql = neon(serverEnv.DATABASE_URL);
  return drizzle({ client: sql, schema });
}

let instance: Database | undefined;

function getDatabase(): Database {
  instance ??= createDatabase();
  return instance;
}

/** Lazily creates the Neon client so imports and schema generation need no live secret. */
export const db = new Proxy({} as Database, {
  get(_target, property: string | symbol) {
    return getDatabase()[property as keyof Database];
  },
  has(_target, property: string | symbol) {
    return property in getDatabase();
  },
});
