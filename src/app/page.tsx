import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="landing-page">
      <div className="landing-main">
        <div className="landing-brand"><span className="brand-emblem" aria-hidden="true">Y</span><span>Yggdrasil</span></div>
        <div className="landing-hero">
          <p className="section-kicker">3D asset studio</p>
          <h1>Yggdrasil<span>for models.</span></h1>
          <p>Prepare 3D assets for the web. Bring in complete model packages, inspect their scenes and animations, then shape them for Valkyrie, Einherji, and the worlds that follow.</p>
          <Link className="landing-cta" href="/library">Open the studio <ArrowUpRight size={18} aria-hidden="true" /></Link>
        </div>
        <p className="landing-footer">A local workspace for the models behind your websites.</p>
      </div>
      <div className="landing-aside" aria-hidden="true"><p>Source / Shape / Ship</p><strong>Y.</strong><p>One source. Many worlds.</p></div>
    </main>
  );
}
