export type ImportErrorCode =
  | "INVALID_PATH"
  | "UNSUPPORTED_FILE"
  | "INVALID_FILE"
  | "INVALID_ARCHIVE"
  | "ARCHIVE_LIMIT_EXCEEDED"
  | "NO_PRIMARY_MODEL"
  | "AMBIGUOUS_PRIMARY_MODEL";

export class AssetImportError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
    public readonly candidates: string[] = [],
  ) {
    super(message);
    this.name = "AssetImportError";
  }
}
