export type ImportFile = { relativePath: string; bytes: Uint8Array };

export type ImportManifest = {
  primaryModel: ImportFile;
  dependencies: ImportFile[];
  attributionFiles: ImportFile[];
  thumbnails: ImportFile[];
  warnings: Array<{ code: string; message: string }>;
};
