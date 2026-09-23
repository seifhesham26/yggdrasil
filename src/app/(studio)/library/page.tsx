import { requireOwnerSession } from "@/auth/server-session";
import { DrizzleAssetRepository } from "@/features/assets/infrastructure/asset-repository";
import { AssetCard } from "@/features/assets/ui/asset-card";
import { ImportDropzone } from "@/features/assets/ui/import-dropzone";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const session = await requireOwnerSession();
  const assets = await new DrizzleAssetRepository().listAssets(session.user.id);
  return (
    <main className="library-page">
      <div className="library-intro"><div><p className="section-kicker">Your collection</p><h1>The library</h1><p>Every source model, ready to inspect and shape for your websites.</p></div><span className="library-count">{assets.length} {assets.length === 1 ? "asset" : "assets"}</span></div>
      <ImportDropzone />
      <section className="library-list" aria-labelledby="library-list-heading">
        <div className="library-list-header"><div><p className="section-kicker">Stored models</p><h2 id="library-list-heading">Recent assets</h2></div><span>Most recent first</span></div>
        {assets.length ? <div className="asset-list">{assets.map((asset) => <AssetCard key={asset.id} asset={asset} />)}</div> : <div className="library-empty"><span aria-hidden="true">◇</span><h3>Your library starts with a model.</h3><p>Choose a glTF or GLB file above. Include its textures, binaries, and animations in the same folder or ZIP.</p></div>}
      </section>
    </main>
  );
}
