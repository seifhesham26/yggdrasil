import type { ImportFile } from "../domain/types";

export type VariantCandidate = {
  model: ImportFile;
  resources: ImportFile[];
  attributionFiles: ImportFile[];
  attribution: "present" | "unknown";
  selected: boolean;
};

function extension(path: string): string {
  return path.slice(path.lastIndexOf(".") + 1).toLowerCase();
}

function relative(base: string, child: string): string {
  const parts = base.split("/");
  parts.pop();
  for (const part of child.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function references(model: ImportFile): string[] {
  const text = new TextDecoder().decode(model.bytes);
  if (extension(model.relativePath) === "obj") {
    return [...text.matchAll(/^\s*(?:mtllib|map_[^\s]+)\s+(.+)$/gim)].map((match) => match[1].trim().split(/\s+/).at(-1)!).filter(Boolean);
  }
  try {
    const json: unknown = JSON.parse(text);
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
  } catch {
    return [];
  }
}

export function inventoryVariants(entries: ImportFile[], selectedModelPath?: string): VariantCandidate[] {
  const files = new Map(entries.map((entry) => [entry.relativePath.toLocaleLowerCase("en-US"), entry]));
  const models = entries.filter((entry) => ["gltf", "glb", "obj", "fbx"].includes(extension(entry.relativePath)));
  const attributionFiles = entries.filter((entry) => ["txt", "md"].includes(extension(entry.relativePath)));
  return models.map((model) => {
    const resources = references(model).map((reference) => files.get(relative(model.relativePath, reference).toLocaleLowerCase("en-US"))).filter((file): file is ImportFile => Boolean(file));
    return { model, resources, attributionFiles, attribution: attributionFiles.length ? "present" : "unknown", selected: model.relativePath === selectedModelPath };
  });
}
