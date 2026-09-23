import type { ReactNode } from "react";
import Link from "next/link";
import { requireOwnerSession } from "@/auth/server-session";
import { SignOutButton } from "@/features/assets/ui/sign-out-button";

const steps = ["Import", "Analyze", "Optimize", "Appearance", "Scene", "Interactions", "Animate", "Export"];

export default async function StudioLayout({ children }: { children: ReactNode }) {
  await requireOwnerSession();
  return (
    <div className="studio-shell">
      <aside className="studio-sidebar" aria-label="Studio navigation">
        <Link href="/library" className="studio-brand"><span className="brand-emblem" aria-hidden="true">Y</span><span>Yggdrasil<small>Model studio</small></span></Link>
        <div className="sidebar-group">
          <p className="sidebar-caption">Workspace</p>
          <Link href="/library" className="sidebar-library-link" aria-current="page">Library</Link>
        </div>
        <nav className="step-navigation" aria-label="Guided workflow">
          <p className="sidebar-caption">Workflow</p>
          <ol>{steps.map((step, index) => <li key={step} className={index === 0 ? "step-active" : "step-upcoming"}><span className="step-number">{String(index + 1).padStart(2, "0")}</span><span>{step}</span>{index === 0 ? <span className="step-current">Current</span> : null}</li>)}</ol>
        </nav>
        <div className="sidebar-bottom"><p>Models for worlds worth building.</p><SignOutButton /></div>
      </aside>
      <div className="studio-main">
        <header className="studio-topbar"><span>Yggdrasil <span className="topbar-slash">/</span> Library</span><span className="topbar-local"><span className="online-dot" aria-hidden="true" /> Local workspace</span></header>
        {children}
      </div>
    </div>
  );
}
