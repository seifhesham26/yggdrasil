import { constants } from "node:fs";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { open, readFile, rename, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AssetStorage } from "./types";
import { parseStorageKey, type StorageKey } from "./storage-key";

export class LocalAssetStorage implements AssetStorage {
  private readonly root: string;

  constructor(root: string) {
    if (!isAbsolute(root)) throw new Error("Asset storage root must be absolute.");
    mkdirSync(root, { recursive: true });
    this.root = realpathSync.native(root);
  }

  processingPath(key: StorageKey): string {
    const safe = parseStorageKey(key);
    const candidate = resolve(this.root, ...safe.split("/"));
    const rel = relative(this.root, candidate);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error("Invalid storage key: path escapes storage root.");
    }

    // Existing links could escape the root despite a lexically safe key.
    let current = this.root;
    for (const part of safe.split("/")) {
      current = join(current, part);
      try {
        if (lstatSync(current).isSymbolicLink()) {
          throw new Error("Invalid storage key: symlink in storage path.");
        }
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
    return candidate;
  }

  async put(key: StorageKey, bytes: Uint8Array): Promise<void> {
    const target = this.processingPath(key);
    mkdirSync(resolve(target, ".."), { recursive: true });
    this.processingPath(key);
    const file = await open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try {
      await file.writeFile(bytes);
    } finally {
      await file.close();
    }
  }

  async read(key: StorageKey): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.processingPath(key)));
  }

  async exists(key: StorageKey): Promise<boolean> {
    return existsSync(this.processingPath(key));
  }

  async removeTree(prefix: StorageKey): Promise<void> {
    const safe = parseStorageKey(prefix);
    if (safe.split("/").length < 2) throw new Error("Invalid storage key: tree prefix is too broad.");
    await rm(this.processingPath(safe), { recursive: true, force: true });
  }

  async commitTree(stagedPrefix: StorageKey, finalPrefix: StorageKey): Promise<void> {
    const staged = parseStorageKey(stagedPrefix);
    const final = parseStorageKey(finalPrefix);
    if (!staged.startsWith("staging/") || !final.startsWith("assets/")) {
      throw new Error("Invalid storage key: expected staging to assets commit.");
    }
    const sourcePath = this.processingPath(staged);
    const targetPath = this.processingPath(final);
    if (existsSync(targetPath)) throw new Error("Asset target already exists.");
    mkdirSync(resolve(targetPath, ".."), { recursive: true });
    this.processingPath(final);
    await rename(sourcePath, targetPath);
  }
}
