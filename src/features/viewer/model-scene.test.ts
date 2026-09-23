import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { disposeLoadedScene, modelResourceUrl } from "./model-scene";

const modelUrl = "/api/assets/asset-1/file?key=assets%2Fasset-1%2Fsource%2Ffolder%2Fhero.gltf";
const files = [
  { relativePath: "folder/hero.gltf", storageKey: "assets/asset-1/source/folder/hero.gltf" },
  { relativePath: "folder/texture.png", storageKey: "assets/asset-1/source/folder/texture.png" },
  { relativePath: "shared.bin", storageKey: "assets/asset-1/source/shared.bin" },
];

describe("modelResourceUrl", () => {
  it("leaves the primary owner-scoped URL alone", () => {
    expect(modelResourceUrl(modelUrl, "folder/hero.gltf", files, modelUrl)).toBe(modelUrl);
  });

  it("maps sibling texture and binary URLs through the protected file route", () => {
    expect(modelResourceUrl(modelUrl, "folder/hero.gltf", files, "/api/assets/asset-1/texture.png")).toBe(
      "/api/assets/asset-1/file?key=assets%2Fasset-1%2Fsource%2Ffolder%2Ftexture.png",
    );
    expect(modelResourceUrl(modelUrl, "folder/hero.gltf", files, "../shared.bin")).toBe(
      "/api/assets/asset-1/file?key=assets%2Fasset-1%2Fsource%2Fshared.bin",
    );
  });

  it("does not request an unlisted remote resource", () => {
    expect(modelResourceUrl(modelUrl, "folder/hero.gltf", files, "https://example.invalid/texture.png")).toMatch(/^data:/);
    expect(modelResourceUrl(modelUrl, "folder/hero.gltf", files, "https://example.invalid/texture.png?key=anything")).toMatch(/^data:/);
  });
});

describe("disposeLoadedScene", () => {
  it("disposes loader-owned resources only once when meshes share them", () => {
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    const root = new Group();
    root.add(new Mesh(geometry, material), new Mesh(geometry, material));

    disposeLoadedScene(root);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });
});
