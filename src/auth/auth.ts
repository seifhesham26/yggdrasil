import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions } from "better-auth";

import { db } from "../db/client";
import * as schema from "../db/schema";
import { user as authUser } from "../db/schema/auth";
import { serverEnv } from "../lib/env/server";
import { canCreateOwner } from "./owner-policy";

function buildAuthOptions(): BetterAuthOptions {
  const env = serverEnv;

  return {
    database: drizzleAdapter(db, { provider: "pg", schema }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
    },
    databaseHooks: {
      user: {
        create: {
          async before(candidateUser) {
            const existingUsers = await db
              .select({ id: authUser.id })
              .from(authUser)
              .limit(2);
            return canCreateOwner(
              existingUsers.length,
              candidateUser.email,
              env.YGGDRASIL_OWNER_EMAIL,
            );
          },
        },
      },
    },
  };
}

export function createAuth() {
  return betterAuth(buildAuthOptions());
}

type AuthInstance = ReturnType<typeof createAuth>;

let instance: AuthInstance | undefined;

function getAuth(): AuthInstance {
  instance ??= createAuth();
  return instance;
}

/**
 * Keep Better Auth initialization lazy: importing route modules for static
 * builds must not require live Neon credentials.
 */
const authTarget = (request: Request) => getAuth().handler(request);
type LazyAuth = typeof authTarget & Pick<AuthInstance, "api" | "options">;

export const auth = new Proxy(authTarget, {
  has(_target, property) {
    return property === "handler" || property in getAuth();
  },
  get(_target, property: string | symbol) {
    if (property === "options") return buildAuthOptions();
    return getAuth()[property as keyof AuthInstance];
  },
  apply(_target, _thisArg, args: [Request]) {
    return getAuth().handler(args[0]);
  },
}) as LazyAuth;
