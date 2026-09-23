import type { AssetAnalysis } from "../domain/types";
import { buildOptimizationReport } from "../domain/optimization";

export function AnalysisSummary({ analysis, byteSize }: { analysis: AssetAnalysis; byteSize: number }) {
  const items = [
    ["Scenes", analysis.counts.scenes],
    ["Nodes", analysis.counts.nodes],
    ["Meshes", analysis.counts.meshes],
    ["Triangles", analysis.counts.triangles],
    ["Materials", analysis.counts.materials],
    ["Textures", analysis.counts.textures],
    ["Skins", analysis.counts.skins],
    ["Animations", analysis.counts.animations],
  ] as const;
  return (
    <section className="analysis-summary" aria-labelledby="analysis-title">
      <h2 id="analysis-title">Model inventory</h2>
      <dl className="analysis-counts">
        {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}
      </dl>
      {analysis.warnings.length ? <div className="analysis-warnings"><h3>Import findings</h3><ul>{analysis.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><span className={`finding-severity finding-${warning.severity}`}>{warning.severity}</span>{warning.message}</li>)}</ul></div> : null}
      {(() => { const report = buildOptimizationReport(analysis, byteSize); return report.state === "no-recommendations" ? <p className="analysis-clear">No optimization recommendations.</p> : <div className="analysis-warnings"><h3>Optimization recommendations</h3><ul>{report.findings.map((item) => <li key={item.id}><span className={`finding-severity finding-${item.supported ? "info" : "warning"}`}>{item.supported ? "review" : "warning"}</span><strong>{item.kind.replaceAll("-", " ")}</strong>: {item.evidence} {item.supported ? "Owner approval is required." : item.warning}</li>)}</ul><p className="detail-empty">Benefits are estimates until a derived version is generated; source bytes are never replaced.</p></div>; })()}
    </section>
  );
}
