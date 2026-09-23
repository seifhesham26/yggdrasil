import type { AssetAnalysis } from "../domain/types";

export function AnalysisSummary({ analysis }: { analysis: AssetAnalysis }) {
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
      {analysis.warnings.length ? <div className="analysis-warnings"><h3>Findings</h3><ul>{analysis.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><span className={`finding-severity finding-${warning.severity}`}>{warning.severity}</span>{warning.message}</li>)}</ul></div> : <p className="analysis-clear">No analysis findings.</p>}
    </section>
  );
}
