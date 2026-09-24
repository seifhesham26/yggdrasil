import { open, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { ImportSource } from "../domain/types";
import { buildImportManifest, expandZip, expandZipFile } from "../infrastructure/import-manifest";
import { inventoryVariants } from "./variant-inventory";

export type VariantReview = {
  candidates: Array<{ modelPath: string; resources: string[]; missingResources: string[]; problems: string[]; resourceInspection: "complete" | "unverified"; attributionFiles: string[]; attribution: "present" | "unknown"; selected: boolean }>;
  attributionFiles: Array<{ relativePath: string; text: string; truncated: boolean }>;
};

const previewLimit = 64 * 1024;
const isModel = (path: string) => /\.(?:gltf|glb|obj|fbx)$/i.test(path);

async function attributionPreview(file: ImportSource) {
  const size = "bytes" in file ? file.bytes.byteLength : file.byteSize;
  let bytes: Uint8Array;
  if ("bytes" in file) bytes = file.bytes.subarray(0, previewLimit);
  else {
    const handle = await open(file.path, "r");
    try {
      const buffer = Buffer.alloc(Math.min(size, previewLimit));
      const result = await handle.read(buffer, 0, buffer.byteLength, 0);
      bytes = buffer.subarray(0, result.bytesRead);
    } finally { await handle.close(); }
  }
  return { relativePath: file.relativePath, text: new TextDecoder().decode(bytes), truncated: size > previewLimit };
}

/** Review uses the same manifest validator as import, while retaining only one text file in memory at a time. */
export async function reviewImportSources(uploaded: ImportSource[], selectedModelPath?: string): Promise<VariantReview> {
  const archive = uploaded.length === 1 && /\.zip$/i.test(uploaded[0].relativePath) ? uploaded[0] : undefined;
  let extractedDirectory: string | undefined;
  try {
    const entries = archive ? "bytes" in archive ? expandZip(archive.bytes) : await expandZipFile(archive) : uploaded;
    if (archive && entries.length && "path" in entries[0]) extractedDirectory = dirname(entries[0].path);
    const first = entries.find((file) => isModel(file.relativePath));
    const manifest = await buildImportManifest(entries, selectedModelPath ?? first?.relativePath, { validateDependencies: false, validateModelContent: false });
    const files = [manifest.primaryModel, ...manifest.alternates, ...manifest.dependencies, ...manifest.attributionFiles];
    const variants = await inventoryVariants(files, selectedModelPath);
    return {
      candidates: variants.map((variant) => ({
        modelPath: variant.model.relativePath, resources: variant.resources.map((file) => file.relativePath),
        missingResources: variant.missingResources, problems: variant.problems, resourceInspection: variant.resourceInspection,
        attributionFiles: variant.attributionFiles.map((file) => file.relativePath), attribution: variant.attribution, selected: variant.selected,
      })),
      attributionFiles: await Promise.all(manifest.attributionFiles.map(attributionPreview)),
    };
  } finally {
    if (extractedDirectory) await rm(extractedDirectory, { recursive: true, force: true });
  }
}
