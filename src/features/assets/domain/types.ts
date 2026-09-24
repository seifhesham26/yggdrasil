export type ImportFile = { relativePath: string; bytes: Uint8Array };
export type FileBackedImportFile = { relativePath: string; path: string; byteSize: number; sha256: string };
export type ImportSource = ImportFile | FileBackedImportFile;
export type ImportJobFile = { relativePath: string; storageKey: string; byteSize: number; sha256: string };

export type ImportManifest<T extends ImportSource = ImportFile> = {
  primaryModel: T;
  alternates: T[];
  archive?: T;
  dependencies: T[];
  attributionFiles: T[];
  thumbnails: T[];
  warnings: Array<{ code: string; message: string }>;
};

export type AssetAnalysis = {
  format: "gltf" | "glb";
  counts: {
    scenes: number;
    nodes: number;
    meshes: number;
    primitives: number;
    vertices: number;
    triangles: number;
    materials: number;
    textures: number;
    skins: number;
    morphTargets: number;
    cameras: number;
    lights: number;
    animations: number;
  };
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
  animations: Array<{ name: string; durationSeconds: number; channels: number }>;
  nodeNames: string[];
  extensionsUsed: string[];
  warnings: Array<{ code: string; severity: "info" | "warning" | "error"; message: string }>;
};
