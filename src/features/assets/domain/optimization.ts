import type { AssetAnalysis } from "./types";

export type OptimizationOperation = "remove-unused" | "normalize" | "resize-textures" | "compress-geometry" | "lower-detail";
// Only extensions with fidelity fixtures are eligible for a rewrite. Others can
// still be imported/inspected, but must not be silently dropped by optimization.
export const optimizationExtensions = new Set([
  "KHR_materials_unlit",
  "KHR_materials_clearcoat",
  "EXT_meshopt_compression",
  "KHR_mesh_quantization",
  "EXT_texture_webp",
  "EXT_texture_avif",
]);

export function optimizationWarnings(analysis: Pick<AssetAnalysis, "extensionsUsed" | "warnings">): string[] {
  return [
    ...analysis.extensionsUsed.filter((name) => !optimizationExtensions.has(name)).map((name) => `Material/extension fidelity is not verified for ${name}; optimization is disabled.`),
    ...analysis.warnings.filter((warning) => warning.severity === "error" || warning.code === "MISSING_TEXTURE").map((warning) => warning.message),
  ];
}
export type FindingKind = "unused-resources" | "oversized-texture" | "expensive-geometry" | "safe-normalization";

export type OptimizationFinding = {
  id: string;
  kind: FindingKind;
  operation: OptimizationOperation;
  affectedResourceIds: string[];
  evidence: string;
  estimatedGain: { label: "estimate"; bytes?: number; percent?: number };
  qualityRisk: "none" | "low" | "medium" | "high";
  supported: boolean;
  warning?: string;
};

export type OptimizationReport = {
  state: "recommendations" | "no-recommendations";
  findings: OptimizationFinding[];
};

function finding(input: Omit<OptimizationFinding, "id">): OptimizationFinding {
  return { ...input, id: `${input.kind}:${input.operation}` };
}

/** Deterministic heuristics only; savings remain estimates until an output is measured. */
export function buildOptimizationReport(analysis: AssetAnalysis, byteSize: number): OptimizationReport {
  const findings: OptimizationFinding[] = [];
  if (analysis.warnings.some((warning) => warning.code === "MISSING_TEXTURE")) {
    findings.push(finding({
      kind: "unused-resources", operation: "remove-unused", affectedResourceIds: ["textures"],
      evidence: "The analysis found texture references without image data.", estimatedGain: { label: "estimate", percent: 0 },
      qualityRisk: "medium", supported: false,
      warning: "The texture/material state is incomplete; removal is disabled until the source is repaired.",
    }));
  }
  if (analysis.warnings.some((warning) => warning.code === "LARGE_TEXTURE")) {
    const blockers = optimizationWarnings(analysis);
    findings.push(finding({
      kind: "oversized-texture", operation: "resize-textures", affectedResourceIds: ["textures"],
      evidence: "One or more textures exceed the 4096-pixel review threshold.", estimatedGain: { label: "estimate", percent: 25 },
      qualityRisk: "medium", supported: false,
      warning: blockers.length ? blockers.join(" ") : undefined,
    }));
    findings[findings.length - 1].supported = blockers.length === 0;
  }
  if (analysis.counts.triangles > 250_000 || analysis.warnings.some((warning) => warning.code === "HIGH_TRIANGLE_COUNT")) {
    const blockers = optimizationWarnings(analysis);
    findings.push(finding({
      kind: "expensive-geometry", operation: "lower-detail", affectedResourceIds: ["meshes"],
      evidence: `The model contains ${analysis.counts.triangles.toLocaleString()} triangles.`, estimatedGain: { label: "estimate", percent: 30 },
      qualityRisk: "high", supported: blockers.length === 0,
      warning: blockers.length ? blockers.join(" ") : undefined,
    }));
    findings.push(finding({
      kind: "expensive-geometry", operation: "compress-geometry", affectedResourceIds: ["meshes"],
      evidence: `The model contains ${analysis.counts.triangles.toLocaleString()} triangles that can be encoded with meshopt.`, estimatedGain: { label: "estimate", percent: 35 },
      qualityRisk: "medium", supported: blockers.length === 0,
      warning: blockers.length ? blockers.join(" ") : undefined,
    }));
  }
  const blockers = optimizationWarnings(analysis);
  if (analysis.counts.nodes > 0) {
    findings.push(finding({
      kind: "safe-normalization", operation: "normalize", affectedResourceIds: ["scene"],
      evidence: "The scene can be rewritten with deterministic resource pruning and deduplication.", estimatedGain: { label: "estimate", bytes: Math.max(0, Math.floor(byteSize * 0.05)), percent: 5 },
      qualityRisk: "low", supported: blockers.length === 0, warning: blockers.length ? blockers.join(" ") : undefined,
    }));
  }
  const unique = [...new Map(findings.map((item) => [item.id, item])).values()];
  return { state: unique.length ? "recommendations" : "no-recommendations", findings: unique };
}
