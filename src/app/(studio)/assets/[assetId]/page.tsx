import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Box, FileArchive, Film, Info } from "lucide-react";
import { requireOwnerSession } from "@/auth/server-session";
import { DrizzleAssetRepository } from "@/features/assets/infrastructure/asset-repository";
import { AnalysisSummary } from "@/features/assets/ui/analysis-summary";
import { ModelCanvasLoader } from "@/features/viewer/model-canvas-loader";

export const dynamic = "force-dynamic";

export default async function AssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const session = await requireOwnerSession();
  const { assetId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) notFound();
  const asset = await new DrizzleAssetRepository().getAsset(assetId, session.user.id);
  if (!asset) notFound();
  const primary = asset.files.find((file) => file.role === "model");
  const url = primary ? `/api/assets/${asset.id}/file?key=${encodeURIComponent(primary.storageKey)}` : null;
  const totalSize = asset.byteSize === null ? "Pending" : `${(asset.byteSize / 1024 / 1024).toFixed(1)} MB`;
  return (
    <main className="asset-detail-page">
      <Link href="/library" className="asset-back"><ArrowLeft size={16} aria-hidden="true" /> Back to library</Link>
      <div className="asset-detail-heading"><div><p className="section-kicker">Asset report</p><h1>{asset.name}</h1><p>{asset.format ?? "Source model"} <span aria-hidden="true">/</span> {asset.files.length} {asset.files.length === 1 ? "file" : "files"} <span aria-hidden="true">/</span> {totalSize}</p></div><span className={`asset-status asset-status-${asset.status}`}>{asset.status}</span></div>
      <div className="asset-detail-grid">
        <section className="asset-preview-section" aria-label="Model preview">
          {asset.status === "ready" && url && primary ? <ModelCanvasLoader modelUrl={url} primaryRelativePath={primary.relativePath} files={asset.files.map((file) => ({ relativePath: file.relativePath, storageKey: file.storageKey }))} /> : <div className="asset-preview-unavailable"><Box size={34} aria-hidden="true" /><h2>Preview not ready</h2><p>{asset.status === "failed" ? "This import did not complete. Return to the library and try the source package again." : "The model is still being prepared."}</p></div>}
        </section>
        <aside className="asset-report-panel">
          {asset.analysis ? <AnalysisSummary analysis={asset.analysis} /> : <div className="report-placeholder"><Info size={24} aria-hidden="true" /><h2>Analysis pending</h2><p>Technical details appear here after a successful import.</p></div>}
        </aside>
      </div>
      <div className="asset-detail-lower">
        <section className="asset-info-section" aria-labelledby="source-heading"><div className="detail-section-title"><FileArchive size={20} aria-hidden="true" /><h2 id="source-heading">Source package</h2></div><dl><div><dt>Primary model</dt><dd>{primary?.relativePath ?? "Not available"}</dd></div><div><dt>Stored files</dt><dd>{asset.files.length}</dd></div><div><dt>Source size</dt><dd>{totalSize}</dd></div><div><dt>Imported</dt><dd><time dateTime={asset.createdAt.toISOString()}>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(asset.createdAt)}</time></dd></div></dl><p className="detail-empty">No destructive changes applied. Your original source files remain unchanged.</p></section>
        <section className="asset-info-section" aria-labelledby="animation-heading"><div className="detail-section-title"><Film size={20} aria-hidden="true" /><h2 id="animation-heading">Animations</h2></div>{asset.analysis?.animations.length ? <ul className="animation-list">{asset.analysis.animations.map((clip, index) => <li key={`${clip.name}-${index}`}><span>{clip.name || `Untitled clip ${index + 1}`}</span><span>{clip.durationSeconds.toFixed(2)} s <span aria-hidden="true">/</span> {clip.channels} channels</span></li>)}</ul> : <p className="detail-empty">No embedded animation clips found.</p>}</section>
      </div>
      {asset.analysis?.extensionsUsed.length ? <p className="asset-extensions"><strong>Extensions used</strong> {asset.analysis.extensionsUsed.join(", ")}</p> : null}
    </main>
  );
}
