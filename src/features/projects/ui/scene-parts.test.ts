import { describe, expect, it } from "vitest";
import { BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { applyAppearance, indexSceneParts, resetAppearanceProperty } from "./scene-parts";

function fixture() {
  const root = new Group();
  const left = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "#ffffff" }));
  const right = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "#ffffff" }));
  left.name = right.name = "Wing";
  root.add(left, right);
  return { root, left, right };
}

describe("appearance part references", () => {
  it("distinguishes duplicate names and refuses a renamed target", () => {
    const { root, left, right } = fixture();
    const parts = indexSceneParts(root);
    expect(parts.map((part) => part.id)).toHaveLength(2);
    expect(parts[0].id).not.toBe(parts[1].id);
    expect(parts[0].object).toBe(left);
    expect(parts[1].object).toBe(right);
    left.name = "Other";
    expect(indexSceneParts(root).some((part) => part.id === parts[0].id)).toBe(false);
  });

  it("applies an override to one clone without changing shared source materials", () => {
    const { root, left, right } = fixture();
    const sourceMaterial = left.material;
    const id = indexSceneParts(root)[0].id;
    const result = applyAppearance(root, { [id]: { visible: false, position: [1, 2, 3], color: "#123456", roughness: 0.2, opacity: 0.5 } });
    expect(result.missing).toEqual([]);
    expect(left.position.toArray()).toEqual([1, 2, 3]);
    expect(left.visible).toBe(false);
    expect((left.material as MeshStandardMaterial).color.getHexString()).toBe("123456");
    expect(left.material).not.toBe(sourceMaterial);
    expect((right.material as MeshStandardMaterial).color.getHexString()).toBe("ffffff");
    expect((sourceMaterial as MeshStandardMaterial).color.getHexString()).toBe("ffffff");
    result.dispose();
  });

  it("removes only one property while preserving later overrides", () => {
    expect(resetAppearanceProperty({ visible: false, color: "#123456" }, "color")).toEqual({ visible: false });
  });

  it("uses existing model material and texture choices without mutating source materials", () => {
    const { root, left, right } = fixture();
    left.geometry.setAttribute("uv", new Float32BufferAttribute(new Array(left.geometry.getAttribute("position").count * 2).fill(0), 2));
    const texture = new Texture();
    (right.material as MeshStandardMaterial).name = "Painted";
    (right.material as MeshStandardMaterial).map = texture;
    const [leftId, rightId] = indexSceneParts(root).map((part) => part.id);
    const result = applyAppearance(root, { [leftId]: { materialSourceNodeId: rightId, textureSourceNodeId: rightId } });
    expect((left.material as MeshStandardMaterial).name).toBe("Painted");
    expect((left.material as MeshStandardMaterial).map).toBe(texture);
    expect(left.material).not.toBe(right.material);
    result.dispose();
    texture.dispose();
  });

  it("skips a texture choice when the target mesh has no UV coordinates", () => {
    const { root, left, right } = fixture();
    left.geometry.deleteAttribute("uv");
    const texture = new Texture();
    (right.material as MeshStandardMaterial).map = texture;
    const [leftId, rightId] = indexSceneParts(root).map((part) => part.id);
    const applied = applyAppearance(root, { [leftId]: { textureSourceNodeId: rightId } });
    expect(applied.missing).toContain(rightId);
    expect((left.material as MeshStandardMaterial).map).toBeNull();
    applied.dispose();
    texture.dispose();
  });
});
