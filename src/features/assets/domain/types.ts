export type ImportFile = { relativePath: string; bytes: Uint8Array };

export type ImportManifest = {
  primaryModel: ImportFile;
  dependencies: ImportFile[];
  attributionFiles: ImportFile[];
  thumbnails: ImportFile[];
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
