import Link from "next/link";
import { ArrowUpRight, Box, Film, Layers3, ScanLine } from "lucide-react";
import type { AssetSummary } from "../infrastructure/asset-repository";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "Size pending";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AssetCard({ asset }: { asset: AssetSummary }) {
  const updated = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(asset.updatedAt);
  return (
    <Link className="asset-row" href={`/assets/${asset.id}`} aria-label={`Open ${asset.name}`}>
      <span className="asset-row-icon" aria-hidden="true"><Box size={25} strokeWidth={1.4} /></span>
      <span className="asset-row-main">
        <span className="asset-row-name">{asset.name}</span>
        <span className="asset-row-sub">{asset.format ?? "Analyzing"} <span aria-hidden="true">/</span> {formatSize(asset.byteSize)} <span aria-hidden="true">/</span> Updated <time dateTime={asset.updatedAt.toISOString()}>{updated}</time></span>
      </span>
      <span className="asset-row-stats" aria-label="Model statistics">
        <span><Layers3 size={16} aria-hidden="true" /> {asset.counts?.meshes ?? "—"} meshes</span>
        <span><ScanLine size={16} aria-hidden="true" /> {asset.counts?.triangles?.toLocaleString() ?? "—"} triangles</span>
        <span><Film size={16} aria-hidden="true" /> {asset.counts?.animations ?? "—"} animations</span>
      </span>
      <span className={`asset-status asset-status-${asset.status}`}>{asset.status}</span>
      <ArrowUpRight className="asset-row-arrow" size={19} aria-hidden="true" />
    </Link>
  );
}
