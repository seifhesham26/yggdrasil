"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/auth/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return <button type="button" className="sign-out-button" onClick={async () => { await authClient.signOut(); router.replace("/sign-in"); router.refresh(); }}><LogOut size={17} aria-hidden="true" /> Sign out</button>;
}
