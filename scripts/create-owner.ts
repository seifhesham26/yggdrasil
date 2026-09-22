import { createInterface } from "node:readline";

import { auth } from "@/auth/auth";
import { canCreateOwner } from "@/auth/owner-policy";
import { db } from "@/db/client";
import { user } from "@/db/schema/auth";
import { serverEnv } from "@/lib/env/server";

async function readHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("Owner creation requires an interactive terminal.");
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      const input = chunk.toString("utf8");
      if (input === "\u0003") {
        cleanup();
        reject(new Error("Owner creation cancelled."));
        return;
      }
      if (input === "\r" || input === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (input === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += input;
    };
    const cleanup = () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const env = serverEnv;
  const password = await readHidden("Owner password (hidden): ");
  if (password.length < 12) {
    throw new Error("Owner password must be at least 12 characters.");
  }

  const existingUsers = await db
    .select({ id: user.id })
    .from(user)
    .limit(1);
  if (!canCreateOwner(existingUsers.length, env.YGGDRASIL_OWNER_EMAIL, env.YGGDRASIL_OWNER_EMAIL)) {
    console.log("An owner already exists; no account was created.");
    return;
  }

  const result = await auth.api.signUpEmail({
    body: {
      name: "Owner",
      email: env.YGGDRASIL_OWNER_EMAIL,
      password,
    },
  });
  if (result == null) {
    throw new Error("Better Auth did not create the owner account.");
  }
  console.log(`Owner account created for ${env.YGGDRASIL_OWNER_EMAIL}.`);
}

const readline = createInterface({ input: process.stdin, output: process.stdout });
readline.close();
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Owner creation failed.");
  process.exitCode = 1;
});
