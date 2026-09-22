import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { serverEnv } from "@/lib/env/server";
import { canCreateOwner } from "./owner-policy";

type AuthInstance = ReturnType<typeof betterAuth>;

let instance: AuthInstance | undefined;

function createAuth(): AuthInstance {
  const env = serverEnv;
  const authSchema = schema as typeof schema & { user: any };

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
    },
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            const existingUsers = await db
              .select({ id: authSchema.user.id })
              .from(authSchema.user)
              .limit(2);
            return canCreateOwner(
              existingUsers.length,
              user.email,
              env.YGGDRASIL_OWNER_EMAIL,
            );
          },
        },
      },
    },
  }) as unknown as AuthInstance;
}

function getAuth(): AuthInstance {
  instance ??= createAuth();
  return instance;
}

/**
 * Keep Better Auth initialization lazy: importing route modules for static
 * builds must not require live Neon credentials.
 */
export const auth = new Proxy((() => undefined) as unknown as AuthInstance, {
  has(_target, property) {
    return property === "handler" || property in getAuth();
  },
  get(_target, property: string | symbol) {
    return getAuth()[property as keyof AuthInstance];
  },
  apply(_target, _thisArg, args: [Request]) {
    return getAuth().handler(args[0]);
  },
});
