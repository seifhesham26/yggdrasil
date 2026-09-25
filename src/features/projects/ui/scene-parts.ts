import { Material, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";
import type { ProjectSnapshot } from "../domain/project-state";

type AppearanceOverride = ProjectSnapshot["appearance"]["nodes"][string];
export type ScenePart = { id: string; name: string; type: string; object: Object3D };
export type PartSummary = { id: string; name: string; type: string; visible: boolean; position: [number, number, number]; worldPosition?: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number]; materialName?: string; textureName?: string; hasUv?: boolean; color?: string; opacity?: number; roughness?: number; metalness?: number };

export function summarizePart(part: ScenePart): PartSummary {
  const { object } = part;
  const material = object instanceof Mesh ? (Array.isArray(object.material) ? object.material[0] : object.material) : undefined;
  const standard = material instanceof MeshStandardMaterial ? material : undefined;
  const worldPosition = object.getWorldPosition(new Vector3());
  return {
    id: part.id, name: part.name, type: part.type, visible: object.visible,
    position: [object.position.x, object.position.y, object.position.z],
    worldPosition: [worldPosition.x, worldPosition.y, worldPosition.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z],
    ...(material ? { materialName: material.name || material.type } : {}),
    ...(standard?.map ? { textureName: standard.map.name || "Texture" } : {}),
    ...(object instanceof Mesh ? { hasUv: Boolean(object.geometry?.getAttribute?.("uv")) } : {}),
    ...(standard ? { color: `#${standard.color.getHexString()}`, opacity: standard.opacity, roughness: standard.roughness, metalness: standard.metalness } : {}),
  };
}

/** Child indexes distinguish duplicate names; the name guards against stale hierarchy reuse. */
export function indexSceneParts(root: Object3D): ScenePart[] {
  const parts: ScenePart[] = [];
  function visit(parent: Object3D, path: string) {
    parent.children.forEach((object, index) => {
      const childPath = path ? `${path}.${index}` : String(index);
      const name = object.name || object.type;
      parts.push({ id: `${childPath}:${encodeURIComponent(object.type)}:${encodeURIComponent(name)}`, name, type: object.type, object });
      visit(object, childPath);
    });
  }
  visit(root, "");
  return parts;
}

export function resetAppearanceProperty(override: AppearanceOverride, property: keyof AppearanceOverride): AppearanceOverride {
  const result = { ...override };
  delete result[property];
  return result;
}

export function applyAppearance(root: Object3D, overrides: ProjectSnapshot["appearance"]["nodes"]): { missing: string[]; dispose: () => void } {
  const parts = new Map(indexSceneParts(root).map((part) => [part.id, part.object]));
  const originalMaterials = new Map([...parts].filter(([, object]) => object instanceof Mesh).map(([id, object]) => [id, (object as Mesh).material]));
  const missing: string[] = [];
  const clonedMaterials = new Set<Material>();
  for (const [id, override] of Object.entries(overrides)) {
    const object = parts.get(id);
    if (!object) { missing.push(id); continue; }
    if (override.visible !== undefined) object.visible = override.visible;
    if (override.position) object.position.fromArray(override.position);
    if (override.rotation) object.rotation.set(...override.rotation);
    if (override.scale) object.scale.fromArray(override.scale);
    if (!(object instanceof Mesh)) continue;
    if (override.color === undefined && override.opacity === undefined && override.roughness === undefined && override.metalness === undefined && override.materialSourceNodeId === undefined && override.textureSourceNodeId === undefined) continue;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const materialSource = override.materialSourceNodeId ? originalMaterials.get(override.materialSourceNodeId) : undefined;
    const textureSource = typeof override.textureSourceNodeId === "string" ? originalMaterials.get(override.textureSourceNodeId) : undefined;
    const textureCompatible = Boolean(object.geometry?.getAttribute?.("uv"));
    if (override.materialSourceNodeId && !materialSource) missing.push(override.materialSourceNodeId);
    if (typeof override.textureSourceNodeId === "string" && !textureSource) missing.push(override.textureSourceNodeId);
    const edited = materials.map((material: Material, index) => {
      const source = materialSource ? Array.isArray(materialSource) ? materialSource[index] ?? materialSource[0] : materialSource : material;
      const clone = source.clone();
      clonedMaterials.add(clone);
      if ("color" in clone && override.color) (clone as MeshStandardMaterial).color.set(override.color);
      if (override.opacity !== undefined) { clone.opacity = override.opacity; clone.transparent = override.opacity < 1; }
      if (clone instanceof MeshStandardMaterial) {
        if (override.roughness !== undefined) clone.roughness = override.roughness;
        if (override.metalness !== undefined) clone.metalness = override.metalness;
        if (override.textureSourceNodeId === null) clone.map = null;
        else if (textureSource && !textureCompatible) missing.push(override.textureSourceNodeId!);
        else if (textureSource) {
          const sourceTextureMaterial = Array.isArray(textureSource) ? textureSource[index] ?? textureSource[0] : textureSource;
          if (sourceTextureMaterial instanceof MeshStandardMaterial && sourceTextureMaterial.map) clone.map = sourceTextureMaterial.map;
          else missing.push(override.textureSourceNodeId!);
        }
      }
      clone.needsUpdate = true;
      return clone;
    });
    object.material = Array.isArray(object.material) ? edited : edited[0];
  }
  return { missing, dispose: () => clonedMaterials.forEach((material) => material.dispose()) };
}
