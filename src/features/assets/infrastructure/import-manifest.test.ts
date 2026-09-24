// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { AssetImportError } from "../domain/errors";
import type { ImportFile } from "../domain/types";
import { buildImportManifest } from "./import-manifest";
import { createGltfFixture } from "@/test/fixtures/create-gltf-fixture";

const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
const file = (relativePath: string, bytes = new Uint8Array([1, 2, 3])): ImportFile => ({ relativePath, bytes });
const bytes = (value: string) => new TextEncoder().encode(value);
const zipFile = (entries: Record<string, Uint8Array>) => file("bundle.zip", zipSync(entries));

function editCentral(zip: Uint8Array, edit: (view: DataView, offset: number) => void) {
  const copy = new Uint8Array(zip);
  const view = new DataView(copy.buffer);
  for (let offset = 0; offset <= copy.length - 46; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      edit(view, offset);
      return copy;
    }
  }
  throw new Error("Central directory not found");
}

async function rejectsCode(entries: ImportFile[], code: string) {
  await expect(buildImportManifest(entries)).rejects.toMatchObject({ code });
}

describe("buildImportManifest", () => {
  it("selects one GLB and preserves supported dependencies and metadata", async () => {
    const manifest = await buildImportManifest([
      file("hero.glb", glb), file("geometry.bin"), file("base.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      file("color.jpg"), file("color.jpeg"), file("texture.webp"), file("normal.ktx2"),
      file("LICENSE.txt", bytes("License")), file("README.md", bytes("Readme")),
    ]);
    expect(manifest.primaryModel.relativePath).toBe("hero.glb");
    expect(manifest.dependencies.map((entry) => entry.relativePath)).toEqual([
      "geometry.bin", "base.png", "color.jpg", "color.jpeg", "texture.webp", "normal.ktx2",
    ]);
    expect(manifest.attributionFiles.map((entry) => entry.relativePath)).toEqual(["LICENSE.txt", "README.md"]);
  });

  it.each(["../evil.glb", "/evil.glb", "C:/evil.glb", "folder/../../evil.glb", "folder\\evil.glb"])(
    "rejects unsafe path %s", async (path) => rejectsCode([file(path, glb)], "INVALID_PATH"),
  );

  it.each(["script.exe", "script.js", "mesh.gltf.exe"])(
    "rejects executable or unsupported file %s", async (path) => rejectsCode([file("hero.glb", glb), file(path)], "UNSUPPORTED_FILE"),
  );

  it("rejects ambiguous models with candidate paths", async () => {
    await expect(buildImportManifest([file("a.glb", glb), file("b.glb", glb)])).rejects.toMatchObject({
      code: "AMBIGUOUS_PRIMARY_MODEL", candidates: ["a.glb", "b.glb"],
    } satisfies Partial<AssetImportError>);
  });

  it("requires valid glTF 2.0 JSON", async () => {
    await rejectsCode([file("bad.gltf", bytes('{"asset":{"version":"1.0"}}'))], "INVALID_FILE");
    expect((await buildImportManifest([file("good.gltf", bytes('{"asset":{"version":"2.0"}}'))])).primaryModel.relativePath).toBe("good.gltf");
  });

  it("requires a GLB magic signature", async () => {
    await rejectsCode([file("bad.glb", bytes("not glb"))], "INVALID_FILE");
  });

  it("accepts the generated glTF fixture and keeps its binary dependency", async () => {
    const fixture = createGltfFixture();
    const result = await buildImportManifest([fixture.model, fixture.binary]);
    expect(result.primaryModel.relativePath).toBe("triangle.gltf");
    expect(result.dependencies.map((entry) => entry.relativePath)).toEqual(["triangle.bin"]);
    expect(JSON.parse(new TextDecoder().decode(result.primaryModel.bytes)).animations).toHaveLength(1);
  });

  it("rejects image bytes that contradict an image extension", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/9xkAAAAASUVORK5CYII=", "base64");
    await rejectsCode([file("hero.glb", glb), file("wrong.jpg", png)], "INVALID_FILE");
  });

  it("expands a ZIP before selecting the model", async () => {
    const archive = zipFile({ "folder/hero.glb": glb, "folder/LICENSE.txt": bytes("license") });
    const original = new Uint8Array(archive.bytes);
    const result = await buildImportManifest([archive]);
    expect(result.primaryModel.relativePath).toBe("folder/hero.glb");
    expect(result.attributionFiles[0].relativePath).toBe("folder/LICENSE.txt");
    expect(result.archive).toEqual(archive);
    expect(result.archive?.bytes).toEqual(original);
    expect(result.dependencies).not.toContainEqual(archive);
  });

  it("accepts OBJ packages and keeps MTL and texture dependencies", async () => {
    const result = await buildImportManifest([
      file("scene/model.obj", bytes("mtllib model.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")),
      file("scene/model.mtl", bytes("newmtl material\nmap_Kd albedo.png\n")),
      file("scene/albedo.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ]);
    expect(result.primaryModel.relativePath).toBe("scene/model.obj");
    expect(result.dependencies.map((entry) => entry.relativePath)).toEqual(["scene/model.mtl", "scene/albedo.png"]);
  });

  it("names a missing OBJ material dependency", async () => {
    await expect(buildImportManifest([
      file("model.obj", bytes("mtllib missing.mtl\nv 0 0 0\n")),
    ])).rejects.toMatchObject({ code: "MISSING_DEPENDENCY", message: /missing\.mtl/ });
  });

  it("accepts a legal binary FBX signature", async () => {
    const header = new TextEncoder().encode("Kaydara FBX Binary  \\0");
    const result = await buildImportManifest([file("model.fbx", header)]);
    expect(result.primaryModel.relativePath).toBe("model.fbx");
  });

  it("rejects mixing ZIP and direct files", async () => {
    await rejectsCode([zipFile({ "hero.glb": glb }), file("second.glb", glb)], "INVALID_ARCHIVE");
  });

  it("rejects traversal inside ZIP", async () => {
    await rejectsCode([zipFile({ "../evil.glb": glb })], "INVALID_PATH");
  });

  it("rejects duplicate normalized ZIP paths", async () => {
    await rejectsCode([zipFile({ "folder/./hero.glb": glb, "folder/hero.glb": glb })], "INVALID_ARCHIVE");
  });

  it("rejects encrypted ZIP entries", async () => {
    const archive = editCentral(zipSync({ "hero.glb": glb }), (view, offset) => view.setUint16(offset + 8, 1, true));
    await rejectsCode([file("bundle.zip", archive)], "INVALID_ARCHIVE");
  });

  it("rejects ZIP symlinks", async () => {
    const archive = editCentral(zipSync({ "hero.glb": glb }), (view, offset) => {
      view.setUint16(offset + 4, 3 << 8, true);
      view.setUint32(offset + 38, 0o120777 << 16, true);
    });
    await rejectsCode([file("bundle.zip", archive)], "INVALID_ARCHIVE");
  });

  it("rejects declared expanded data over 1 GiB", async () => {
    const archive = editCentral(zipSync({ "hero.glb": glb }), (view, offset) => view.setUint32(offset + 24, 1024 ** 3 + 1, true));
    await rejectsCode([file("bundle.zip", archive)], "ARCHIVE_LIMIT_EXCEEDED");
  });

  it("rejects compression ratios over 100:1", async () => {
    const archive = editCentral(zipSync({ "hero.glb": glb }), (view, offset) => view.setUint32(offset + 24, 100_000, true));
    await rejectsCode([file("bundle.zip", archive)], "ARCHIVE_LIMIT_EXCEEDED");
  });

  it("rejects archives declaring more than 10,000 entries", async () => {
    const archive = new Uint8Array(zipSync({ "hero.glb": glb }));
    const view = new DataView(archive.buffer);
    for (let offset = archive.length - 22; offset >= 0; offset--) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        view.setUint16(offset + 10, 10_001, true);
        break;
      }
    }
    await rejectsCode([file("bundle.zip", archive)], "ARCHIVE_LIMIT_EXCEEDED");
  });
});
