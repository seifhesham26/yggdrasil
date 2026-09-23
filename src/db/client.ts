import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { serverEnv } from "../lib/env/server";
import * as schema from "./schema";

type Database = ReturnType<typeof createDatabase>;

function createDatabase() {
  // Neon accepts PostgreSQL connections. Unlike neon-http, this driver has
  // real Drizzle transactions for multi-table import state changes.
  const pool = new Pool({ connectionString: serverEnv.DATABASE_URL, max: 5 });
  return drizzle({ client: pool, schema });
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
