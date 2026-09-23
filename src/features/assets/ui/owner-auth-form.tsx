"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { authClient } from "@/auth/auth-client";

export function OwnerAuthForm({ setupAvailable }: { setupAvailable: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"setup" | "sign-in">(setupAvailable ? "setup" : "sign-in");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const form = new FormData(event.currentTarget);
      const email = String(form.get("email") ?? "");
      const password = String(form.get("password") ?? "");
      const result = mode === "setup"
        ? await authClient.signUp.email({ name: String(form.get("name") ?? "Owner"), email, password })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? (mode === "setup" ? "Could not create the owner account." : "Unable to sign in."));
        return;
      }
      router.push("/library");
      router.refresh();
    } catch {
      setError("The account service is unavailable. Check the database connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-art" aria-hidden="true"><div className="auth-wordmark">Yggdrasil</div><div className="auth-art-center"><span>Y.</span><p>One source.<br />Many worlds.</p></div><small>Private model studio</small></div>
      <div className="auth-content">
        <Link href="/" className="auth-back">Yggdrasil <span aria-hidden="true">/</span> Studio access</Link>
        <div className="auth-form-wrap">
          <p className="section-kicker">{mode === "setup" ? "First-run setup" : "Welcome back"}</p>
          <h1>{mode === "setup" ? "Create your studio account." : "Sign in to your studio."}</h1>
          <p>{mode === "setup" ? "Use the owner email configured in your local .env file. This is the only account Yggdrasil will allow." : "Your private library and model work are one sign-in away."}</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "setup" ? <label>Display name<input name="name" type="text" autoComplete="name" required defaultValue="Owner" /></label> : null}
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            <label>Password<input name="password" type="password" autoComplete={mode === "setup" ? "new-password" : "current-password"} minLength={mode === "setup" ? 8 : undefined} required /></label>
            {error ? <p role="alert" className="auth-error">{error}</p> : null}
            <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : mode === "setup" ? "Create owner account" : "Sign in"}<ArrowUpRight size={17} aria-hidden="true" /></button>
          </form>
          {setupAvailable ? <button type="button" className="auth-mode-switch" onClick={() => { setMode(mode === "setup" ? "sign-in" : "setup"); setError(null); }}>{mode === "setup" ? "Already created the account? Sign in" : "Need to create the owner account?"}</button> : null}
        </div>
        <p className="auth-footnote">Your models stay in your local asset folder. Account records are stored in your Neon database.</p>
      </div>
    </main>
  );
}
