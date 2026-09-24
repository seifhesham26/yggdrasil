// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildImportManifest } from "./import-manifest";
import { convertModelToGlb } from "./model-converter";

describe("convertModelToGlb", () => {
  it("converts a legal OBJ into a GLB without changing its source bytes", async () => {
    const source = new TextEncoder().encode("o Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
    const result = await convertModelToGlb({ format: "obj", bytes: source, relativePath: "model.obj" });
    expect(new TextDecoder().decode(result.bytes.subarray(0, 4))).toBe("glTF");
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "OBJ_MATERIALS_NOT_CONVERTED" })]));
    expect(source).toEqual(new TextEncoder().encode("o Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"));
  });

  it("converts an OBJ package while retaining its MTL and texture dependencies", async () => {
    const source = new TextEncoder().encode("mtllib triangle.mtl\no Triangle\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Triangle\nf 1 2 3\n");
    const material = new TextEncoder().encode("newmtl Triangle\nmap_Kd triangle.png\n");
    const texture = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const manifest = await buildImportManifest([
      { relativePath: "models/triangle.obj", bytes: source },
      { relativePath: "models/triangle.mtl", bytes: material },
      { relativePath: "models/triangle.png", bytes: texture },
    ]);
    const original = new Uint8Array(manifest.primaryModel.bytes);
    const result = await convertModelToGlb({ format: "obj", bytes: manifest.primaryModel.bytes, relativePath: manifest.primaryModel.relativePath });

    expect(manifest.dependencies.map((file) => file.relativePath)).toEqual(["models/triangle.mtl", "models/triangle.png"]);
    expect(new TextDecoder().decode(result.bytes.subarray(0, 4))).toBe("glTF");
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "OBJ_MATERIALS_NOT_CONVERTED" })]));
    expect(manifest.primaryModel.bytes).toEqual(original);
  });

  it("converts a legal synthetic ASCII FBX and reports fidelity limits", async () => {
    const source = new TextEncoder().encode([
      "; FBX 7.4.0 project file", "FBXHeaderExtension:  {", "\tFBXHeaderVersion: 1003", "\tFBXVersion: 7400", "\tCreator: \"Synthetic Fixture\"", "}",
      "Definitions:  {", "\tVersion: 100", "\tCount: 2", "\tObjectType: \"Model\" {", "\t\tCount: 1", "\t}", "\tObjectType: \"Geometry\" {", "\t\tCount: 1", "\t}", "}",
      "Objects:  {", "\tGeometry: 1000, \"Geometry::Triangle\", \"Mesh\" {", "\t\tGeometryVersion: 124", "\t\tVertices: *9 {", "\t\t\ta: 0,0,0, 1,0,0, 0,1,0", "\t\t}", "\t\tPolygonVertexIndex: *3 {", "\t\t\ta: 0,1,-3", "\t\t}", "\t}", "\tModel: 2000, \"Model::Triangle\", \"Mesh\" {", "\t\tVersion: 232", "\t}", "}",
      "Connections:  {", "\tC: \"OO\", 1000, 2000", "}",
    ].join("\n"));
    const original = new Uint8Array(source);
    const result = await convertModelToGlb({ format: "fbx", bytes: source, relativePath: "triangle.fbx" });
    expect(new TextDecoder().decode(result.bytes.subarray(0, 4))).toBe("glTF");
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "FBX_FIDELITY_LIMITS" })]));
    expect(source).toEqual(original);
  });
});
