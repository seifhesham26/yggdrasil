// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createGltfFixture } from "@/test/fixtures/create-gltf-fixture";
import { reviewImportSources } from "./variant-review";

const bytes = (value: string) => new TextEncoder().encode(value);

describe("reviewImportSources", () => {
  it("returns candidate resources and attribution text before selection", async () => {
    const { model, binary } = createGltfFixture();
    const review = await reviewImportSources([
      { relativePath: "low/model.gltf", bytes: model.bytes },
      { relativePath: "low/triangle.bin", bytes: binary.bytes },
      { relativePath: "high/model.gltf", bytes: model.bytes },
      { relativePath: "high/triangle.bin", bytes: binary.bytes },
      { relativePath: "LICENSE.txt", bytes: bytes("CC0 fixture attribution") },
    ]);
    expect(review.candidates.map((candidate) => candidate.modelPath)).toEqual(["low/model.gltf", "high/model.gltf"]);
    expect(review.candidates[1]).toMatchObject({ resources: ["high/triangle.bin"], missingResources: [], attribution: "present" });
    expect(review.attributionFiles).toEqual([{ relativePath: "LICENSE.txt", text: "CC0 fixture attribution", truncated: false }]);
  });

  it("keeps missing and ambiguous attribution unknown", async () => {
    const review = await reviewImportSources([
      { relativePath: "model.obj", bytes: bytes("v 0 0 0\n") },
      { relativePath: "README.md", bytes: bytes("Unclear terms") },
    ]);
    expect(review.candidates[0].attribution).toBe("unknown");
    expect(review.attributionFiles[0].relativePath).toBe("README.md");
  });

  it("shows a broken candidate while allowing a complete alternate to be chosen", async () => {
    const fixture = createGltfFixture();
    const review = await reviewImportSources([
      { relativePath: "broken/model.obj", bytes: bytes("mtllib absent.mtl\nv 0 0 0\n") },
      { relativePath: "usable/model.gltf", bytes: fixture.model.bytes },
      { relativePath: "usable/triangle.bin", bytes: fixture.binary.bytes },
    ]);
    expect(review.candidates[0].missingResources).toEqual(["broken/absent.mtl"]);
    expect(review.candidates[1]).toMatchObject({ resources: ["usable/triangle.bin"], missingResources: [] });
  });

  it("marks malformed model candidates as incompatible without hiding a valid alternate", async () => {
    const fixture = createGltfFixture();
    const review = await reviewImportSources([
      { relativePath: "bad/model.gltf", bytes: bytes('{"asset":{"version":"1.0"}}') },
      { relativePath: "good/model.gltf", bytes: fixture.model.bytes },
      { relativePath: "good/triangle.bin", bytes: fixture.binary.bytes },
    ]);
    expect(review.candidates[0].problems).toContain("Unsupported glTF version");
    expect(review.candidates[1].problems).toEqual([]);
  });
});
