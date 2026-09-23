import { createAuth } from "./auth";

// The schema generator needs an eager Better Auth instance. Runtime routes
// continue to use the lazy proxy exported from auth.ts.
process.env.DATABASE_URL ??= "postgresql://schema:only@example.invalid/schema";
process.env.BETTER_AUTH_SECRET ??= "schema-generation-placeholder-32chars";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.YGGDRASIL_ASSET_ROOT ??= "C:\\dev\\yggdrasil-data";
process.env.YGGDRASIL_OWNER_EMAIL ??= "owner@example.test";

export const auth = createAuth();
