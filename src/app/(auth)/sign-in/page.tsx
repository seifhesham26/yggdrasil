import { db } from "@/db/client";
import { user } from "@/db/schema/auth";
import { OwnerAuthForm } from "@/features/assets/ui/owner-auth-form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const existing = await db.select({ id: user.id }).from(user).limit(1);
  return <OwnerAuthForm setupAvailable={existing.length === 0} />;
}
