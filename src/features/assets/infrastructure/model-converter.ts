import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

type Source = { format: "obj" | "fbx"; relativePath: string; bytes: Uint8Array };
export type ConvertedModel = { bytes: Uint8Array; warnings: Array<{ code: string; message: string }> };

function installFileReader(): void {
  if (typeof globalThis.FileReader !== "undefined") return;
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
    onerror: ((error: unknown) => void) | null = null;

    readAsArrayBuffer(blob: Blob): void {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.({ target: this });
      }).catch((error) => this.onerror?.(error));
    }

    readAsDataURL(blob: Blob): void {
      blob.arrayBuffer().then((result) => {
        this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
        this.onloadend?.({ target: this });
      }).catch((error) => this.onerror?.(error));
    }
  }
  globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
}

function exportGlb(object: Parameters<GLTFExporter["parse"]>[0]): Promise<Uint8Array> {
  installFileReader();
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(object, (result) => {
      if (!(result instanceof ArrayBuffer)) return reject(new Error("GLTF exporter returned JSON instead of GLB"));
      resolve(new Uint8Array(result));
    }, reject, { binary: true });
  });
}

export async function convertModelToGlb(source: Source): Promise<ConvertedModel> {
  try {
    const object = source.format === "obj"
      ? new OBJLoader().parse(new TextDecoder().decode(source.bytes))
      : new FBXLoader().parse(source.bytes.slice().buffer, "");
    const bytes = await exportGlb(object);
    return {
      bytes,
      warnings: source.format === "obj"
        ? [{ code: "OBJ_MATERIALS_NOT_CONVERTED", message: "OBJ material references are retained with the source package; conversion uses geometry-safe default materials." }]
        : [{ code: "FBX_FIDELITY_LIMITS", message: "FBX conversion uses Three.js FBXLoader; unsupported morph normals, constraints, and exporter features may not round-trip." }],
    };
  } catch (error) {
    throw new Error(`Could not convert ${source.relativePath}: ${error instanceof Error ? error.message : "unknown converter error"}`);
  }
}
