import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export const getOwnerSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireOwnerSession() {
  const session = await getOwnerSession();
  if (!session) redirect("/sign-in");
  return session;
}
