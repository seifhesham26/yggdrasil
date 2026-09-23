import type { AssetAnalysis } from "./types";

export type OptimizationOperation = "remove-unused" | "normalize" | "resize-textures" | "compress-geometry" | "lower-detail";
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
    findings.push(finding({
      kind: "oversized-texture", operation: "resize-textures", affectedResourceIds: ["textures"],
      evidence: "One or more textures exceed the 4096-pixel review threshold.", estimatedGain: { label: "estimate", percent: 25 },
      qualityRisk: "medium", supported: false,
      warning: "Texture encoding is not enabled in this build; review the source texture before applying a resize.",
    }));
  }
  if (analysis.counts.triangles > 250_000 || analysis.warnings.some((warning) => warning.code === "HIGH_TRIANGLE_COUNT")) {
    findings.push(finding({
      kind: "expensive-geometry", operation: "lower-detail", affectedResourceIds: ["meshes"],
      evidence: `The model contains ${analysis.counts.triangles.toLocaleString()} triangles.`, estimatedGain: { label: "estimate", percent: 30 },
      qualityRisk: "high", supported: false,
      warning: "Automatic simplification is not enabled; inspect the visual trade-off before adding a simplifier.",
    }));
  }
  const hasUnsupportedRequiredExtension = analysis.warnings.some((warning) => warning.code === "UNSUPPORTED_REQUIRED_EXTENSION");
  if (!hasUnsupportedRequiredExtension && analysis.counts.nodes > 0) {
    findings.push(finding({
      kind: "safe-normalization", operation: "normalize", affectedResourceIds: ["scene"],
      evidence: "The scene can be rewritten with deterministic resource pruning and deduplication.", estimatedGain: { label: "estimate", bytes: Math.max(0, Math.floor(byteSize * 0.05)), percent: 5 },
      qualityRisk: "low", supported: true,
    }));
  }
  const unique = [...new Map(findings.map((item) => [item.id, item])).values()];
  return { state: unique.length ? "recommendations" : "no-recommendations", findings: unique };
}
