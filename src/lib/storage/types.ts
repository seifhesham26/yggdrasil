import type { StorageKey } from "./storage-key";

export interface AssetStorage {
  put(key: StorageKey, bytes: Uint8Array): Promise<void>;
  putFile(key: StorageKey, sourcePath: string): Promise<void>;
  read(key: StorageKey): Promise<Uint8Array>;
  exists(key: StorageKey): Promise<boolean>;
  removeTree(prefix: StorageKey): Promise<void>;
  commitTree(stagedPrefix: StorageKey, finalPrefix: StorageKey): Promise<void>;
  /** Server-only path for parsers that require a filesystem path. */
  processingPath(key: StorageKey): string;
}
