import type { ImportSource } from "../domain/types";
import { readImportBytes } from "../infrastructure/import-manifest";

export type VariantCandidate = {
  model: ImportSource;
  resources: ImportSource[];
  missingResources: string[];
  problems: string[];
  resourceInspection: "complete" | "unverified";
  attributionFiles: ImportSource[];
  attribution: "present" | "unknown";
  selected: boolean;
};

function extension(path: string): string {
  return path.slice(path.lastIndexOf(".") + 1).toLowerCase();
}

function relative(base: string, child: string): string | null {
  if (!child || child.startsWith("/") || child.includes("\\") || child.includes(":") || child.includes("%") || child.includes("?") || child.includes("#") || /[\x00-\x1f\x7f]/.test(child)) return null;
  const parts = base.split("/");
  parts.pop();
  for (const part of child.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    }
    else parts.push(part);
  }
  return parts.length ? parts.join("/") : null;
}

async function references(model: ImportSource): Promise<string[]> {
  const ext = extension(model.relativePath);
  if (ext === "fbx") {
    const bytes = await readImportBytes(model);
    const header = new TextDecoder("latin1").decode(bytes.subarray(0, 21));
    const ascii = new TextDecoder().decode(bytes.subarray(0, 256));
    if (!header.startsWith("Kaydara FBX Binary") && !/^\s*;\s*FBX\s+/i.test(ascii)) throw new Error("Invalid FBX header");
    return [];
  }
  if (!["obj", "mtl", "gltf", "glb"].includes(ext)) return [];
  const bytes = await readImportBytes(model);
  if (ext === "glb" && (bytes.byteLength < 20 || new TextDecoder().decode(bytes.subarray(0, 4)) !== "glTF")) throw new Error("Invalid GLB header");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(ext === "glb" ? bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true)) : bytes);
  if (ext === "obj" || ext === "mtl") {
    if (ext === "obj" && !/^\s*(?:v|f)\s+/m.test(text)) throw new Error("Malformed OBJ model");
    return [...text.matchAll(/^\s*(?:mtllib|map_[^\s]+|bump|disp|decal)\s+(.+)$/gim)].map((match) => match[1].trim().split(/\s+/).at(-1)!).filter(Boolean);
  }
  try {
    const json: unknown = JSON.parse(text);
    if (!json || typeof json !== "object" || !("asset" in json) || !json.asset || typeof json.asset !== "object" || !("version" in json.asset) || typeof json.asset.version !== "string" || !json.asset.version.startsWith("2.")) throw new Error("Unsupported glTF version");
    const result: string[] = [];
    const visit = (value: unknown) => {
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          if (key === "uri" && typeof child === "string" && !child.startsWith("data:")) result.push(child);
          else visit(child);
        }
      }
    };
    visit(json);
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === "Unsupported glTF version") throw error;
    throw new Error("Invalid glTF JSON");
  }
}

export async function inventoryVariants(entries: ImportSource[], selectedModelPath?: string): Promise<VariantCandidate[]> {
  const files = new Map(entries.map((entry) => [entry.relativePath.toLocaleLowerCase("en-US"), entry]));
  const models = entries.filter((entry) => ["gltf", "glb", "obj", "fbx"].includes(extension(entry.relativePath)));
  const allAttributionFiles = entries.filter((entry) => ["txt", "md"].includes(extension(entry.relativePath)));
  const variants: VariantCandidate[] = [];
  for (const model of models) {
    const attributionFiles = allAttributionFiles.filter((file) => {
      const directory = file.relativePath.split("/").slice(0, -1).join("/");
      return !directory || model.relativePath.startsWith(`${directory}/`);
    });
    const explicitAttribution = attributionFiles.filter((file) => /^(?:license|licence|copying|credits|attribution|notice)(?:\.[^.]+)?$/i.test(file.relativePath.split("/").at(-1) ?? ""));
    const attribution = explicitAttribution.length === 1 && ("bytes" in explicitAttribution[0] ? explicitAttribution[0].bytes.length : explicitAttribution[0].byteSize) <= 64 * 1024 && new TextDecoder().decode(await readImportBytes(explicitAttribution[0])).trim() ? "present" : "unknown";
    const resources: ImportSource[] = [];
    const missingResources: string[] = [];
    const problems: string[] = [];
    const visited = new Set<string>();
    const visit = async (entry: ImportSource): Promise<void> => {
      for (const reference of await references(entry)) {
        const path = relative(entry.relativePath, reference);
        if (!path) { missingResources.push(`Unsafe reference: ${reference}`); continue; }
        const folded = path.toLocaleLowerCase("en-US");
        if (visited.has(folded)) continue;
        visited.add(folded);
        const file = files.get(folded);
        if (!file) missingResources.push(path);
        else {
          resources.push(file);
          if (extension(file.relativePath) === "mtl") await visit(file);
        }
      }
    };
    try { await visit(model); }
    catch (error) { problems.push(error instanceof Error ? error.message : "Model could not be inspected"); }
    variants.push({ model, resources, missingResources, problems, resourceInspection: extension(model.relativePath) === "fbx" ? "unverified" : "complete", attributionFiles, attribution, selected: model.relativePath === selectedModelPath });
  }
  return variants;
}
