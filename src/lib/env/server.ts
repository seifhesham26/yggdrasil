import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  YGGDRASIL_ASSET_ROOT: z.string().min(3),
  YGGDRASIL_OWNER_EMAIL: z.string().email().transform((value) => value.toLowerCase()),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  return serverEnvSchema.parse(input);
}

let parsedServerEnv: ServerEnv | undefined;

function getServerEnv(): ServerEnv {
  parsedServerEnv ??= parseServerEnv(process.env);
  return parsedServerEnv;
}

/**
 * Server configuration is validated on first property access, rather than at
 * module evaluation, so schema generation and static builds do not require
 * production secrets. Runtime code still receives a fully validated object.
 */
export const serverEnv = new Proxy({} as ServerEnv, {
  get(_target, property: string | symbol) {
    return getServerEnv()[property as keyof ServerEnv];
  },
  has(_target, property: string | symbol) {
    return property in getServerEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(getServerEnv());
  },
  getOwnPropertyDescriptor(_target, property: string | symbol) {
    return {
      enumerable: true,
      configurable: true,
      value: getServerEnv()[property as keyof ServerEnv],
    };
  },
});
