import { describe, expect, it } from "vitest";
import type { AssetAnalysis } from "./types";
import { buildOptimizationReport } from "./optimization";

const clean: AssetAnalysis = {
  format: "gltf", counts: { scenes: 1, nodes: 1, meshes: 1, primitives: 1, vertices: 3, triangles: 1, materials: 1, textures: 0, skins: 0, morphTargets: 0, cameras: 0, lights: 0, animations: 0 },
  bounds: null, animations: [], nodeNames: ["Triangle"], extensionsUsed: [], warnings: [],
};

describe("buildOptimizationReport", () => {
  it("is stable, specific, and deduplicated", () => {
    const report = buildOptimizationReport({ ...clean, counts: { ...clean.counts, triangles: 300_000 }, warnings: [{ code: "HIGH_TRIANGLE_COUNT", severity: "warning", message: "large" }] }, 1000);
    expect(report.state).toBe("recommendations");
    expect(report.findings.map((item) => item.id)).toEqual(["expensive-geometry:lower-detail", "safe-normalization:normalize"]);
    expect(new Set(report.findings.map((item) => item.id)).size).toBe(report.findings.length);
    expect(report.findings.every((item) => item.estimatedGain.label === "estimate")).toBe(true);
  });

  it("reports a clean model explicitly", () => {
    const report = buildOptimizationReport(clean, 1000);
    expect(report).toMatchObject({ state: "recommendations" });
    const noNodes = buildOptimizationReport({ ...clean, counts: { ...clean.counts, nodes: 0 } }, 1000);
    expect(noNodes).toEqual({ state: "no-recommendations", findings: [] });
  });

  it("warns instead of enabling unsupported texture work", () => {
    const report = buildOptimizationReport({ ...clean, counts: { ...clean.counts, textures: 1 }, warnings: [{ code: "LARGE_TEXTURE", severity: "warning", message: "large" }] }, 1000);
    expect(report.findings.find((item) => item.kind === "oversized-texture")).toMatchObject({ supported: false, warning: expect.any(String) });
  });
});
