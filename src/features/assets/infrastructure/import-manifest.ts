import { unzipSync } from "fflate";
import { fileTypeFromBuffer } from "file-type";
import { AssetImportError } from "../domain/errors";
import type { ImportFile, ImportManifest } from "../domain/types";

const MAX_ENTRIES = 10_000;
const MAX_EXPANDED_BYTES = 1024 ** 3;
const MAX_RATIO = 100;
const allowed = new Set([".gltf", ".glb", ".fbx", ".obj", ".mtl", ".bin", ".png", ".jpg", ".jpeg", ".webp", ".ktx2", ".txt", ".md"]);
const modelExtensions = new Set([".gltf", ".glb", ".fbx", ".obj"]);
const attributionExtensions = new Set([".txt", ".md"]);
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".ktx2"]);
const expectedMime: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ktx2": "image/ktx2",
};
const decoder = new TextDecoder("utf-8", { fatal: true });

function fail(code: ConstructorParameters<typeof AssetImportError>[0], message: string): never {
  throw new AssetImportError(code, message);
}

function normalizePath(path: string): string {
  if (!path || path.startsWith("/") || path.startsWith("\\") || /^[a-zA-Z]:/.test(path) || path.includes("\\") || /[\x00-\x1f\x7f]/.test(path)) {
    fail("INVALID_PATH", `Unsafe import path: ${path}`);
  }
  const parts = path.split("/").filter((part) => part && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === ".." || part.endsWith(".") || part.endsWith(" ") || part.includes(":"))) {
    fail("INVALID_PATH", `Unsafe import path: ${path}`);
  }
  return parts.join("/");
}

function extension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

function validateName(path: string, allowZip = false): string {
  const normalized = normalizePath(path);
  const ext = extension(normalized);
  if (!allowed.has(ext) && !(allowZip && ext === ".zip")) {
    fail("UNSUPPORTED_FILE", `Unsupported import file: ${path}`);
  }
  return normalized;
}

function dependencyPath(base: string, referenced: string): string {
  if (!referenced || referenced.includes("\\") || referenced.includes(":") || referenced.startsWith("/")) {
    fail("INVALID_PATH", `Unsafe model dependency URI: ${referenced}`);
  }
  const baseParts = base.split("/");
  baseParts.pop();
  const parts = [...baseParts, ...referenced.split("/")];
  const result: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!result.length) fail("INVALID_PATH", `Model dependency escapes package: ${referenced}`);
      result.pop();
    } else result.push(part);
  }
  return result.join("/");
}

function validateObjDependencies(model: ImportFile, files: Map<string, ImportFile>): void {
  const text = decoder.decode(model.bytes);
  const references = [...text.matchAll(/^\s*mtllib\s+(.+)$/gim)].flatMap((match) => match[1].trim().split(/\s+/));
  if (!/^\s*(?:v|f)\s+/m.test(text)) fail("INVALID_FILE", `Malformed OBJ model: ${model.relativePath}`);
  for (const reference of references) {
    const path = dependencyPath(model.relativePath, reference);
    if (!files.has(path)) fail("MISSING_DEPENDENCY", `OBJ model references missing MTL file: ${path}`);
    const mtl = decoder.decode(files.get(path)!.bytes);
    for (const match of mtl.matchAll(/^\s*(?:map_[^\s]+|bump|disp|decal)\s+(.+)$/gim)) {
      const texture = match[1].trim().split(/\s+/).at(-1)!;
      const texturePath = dependencyPath(path, texture);
      if (!files.has(texturePath)) fail("MISSING_DEPENDENCY", `MTL file references missing texture: ${texturePath}`);
    }
  }
}

function validateFbx(file: ImportFile): void {
  const binaryHeader = new TextDecoder("latin1").decode(file.bytes.subarray(0, 21));
  const asciiHeader = new TextDecoder("utf-8").decode(file.bytes.subarray(0, 256));
  if (!binaryHeader.startsWith("Kaydara FBX Binary") && !/^\s*;\s*FBX\s+/i.test(asciiHeader)) {
    fail("INVALID_FILE", `Malformed FBX model: ${file.relativePath}`);
  }
}

function uint16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) fail("INVALID_ARCHIVE", "Truncated ZIP metadata");
  return view.getUint16(offset, true);
}

function uint32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) fail("INVALID_ARCHIVE", "Truncated ZIP metadata");
  return view.getUint32(offset, true);
}

function expandZip(archive: Uint8Array): ImportFile[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let end = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset--) {
    if (uint32(view, offset) === 0x06054b50 && offset + 22 + uint16(view, offset + 20) === archive.length) {
      end = offset;
      break;
    }
  }
  if (end < 0) fail("INVALID_ARCHIVE", "ZIP end record is missing");
  if (uint16(view, end + 4) !== 0 || uint16(view, end + 6) !== 0) fail("INVALID_ARCHIVE", "Multi-disk ZIP is unsupported");
  const count = uint16(view, end + 10);
  if (count > MAX_ENTRIES) fail("ARCHIVE_LIMIT_EXCEEDED", "ZIP contains too many entries");
  if (count === 0xffff || uint32(view, end + 16) === 0xffffffff) fail("INVALID_ARCHIVE", "ZIP64 is unsupported");
  if (uint16(view, end + 8) !== count) fail("INVALID_ARCHIVE", "ZIP entry counts disagree");
  const directoryLength = uint32(view, end + 12);
  const directoryStart = uint32(view, end + 16);
  if (directoryStart + directoryLength > end) fail("INVALID_ARCHIVE", "ZIP directory is out of bounds");
  let offset = directoryStart;
  let expanded = 0;
  const seen = new Set<string>();
  const names: string[] = [];
  const declaredSizes = new Map<string, number>();
  for (let index = 0; index < count; index++) {
    if (uint32(view, offset) !== 0x02014b50) fail("INVALID_ARCHIVE", "Invalid ZIP directory entry");
    const flags = uint16(view, offset + 8);
    const method = uint16(view, offset + 10);
    const compressed = uint32(view, offset + 20);
    const original = uint32(view, offset + 24);
    const nameLength = uint16(view, offset + 28);
    const extraLength = uint16(view, offset + 30);
    const commentLength = uint16(view, offset + 32);
    const creator = uint16(view, offset + 4);
    const attrs = uint32(view, offset + 38);
    const localOffset = uint32(view, offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > directoryStart + directoryLength || next > archive.length || localOffset >= directoryStart) fail("INVALID_ARCHIVE", "ZIP entry is out of bounds");
    if (flags & 1 || method !== 0 && method !== 8) fail("INVALID_ARCHIVE", "Encrypted or unsupported ZIP entry");
    const mode = creator >>> 8 === 3 ? (attrs >>> 16) & 0o170000 : 0;
    if (mode !== 0 && mode !== 0o100000 && mode !== 0o040000) fail("INVALID_ARCHIVE", "ZIP contains a link or special file");
    let rawName: string;
    try {
      rawName = decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLength));
    } catch {
      fail("INVALID_ARCHIVE", "ZIP contains an invalid filename");
    }
    const directory = rawName.endsWith("/");
    const name = normalizePath(directory ? rawName.slice(0, -1) : rawName);
    const folded = name.toLocaleLowerCase("en-US");
    if (seen.has(folded)) fail("INVALID_ARCHIVE", `Duplicate ZIP path: ${name}`);
    seen.add(folded);
    if (!directory) {
      validateName(name);
      expanded += original;
      if (expanded > MAX_EXPANDED_BYTES || original > MAX_EXPANDED_BYTES || original > compressed * MAX_RATIO) {
        fail("ARCHIVE_LIMIT_EXCEEDED", "ZIP expanded size or compression ratio exceeds limit");
      }
      names.push(name);
      declaredSizes.set(name, original);
    }
    if (uint32(view, localOffset) !== 0x04034b50 || uint16(view, localOffset + 8) !== method || uint16(view, localOffset + 6) !== flags) {
      fail("INVALID_ARCHIVE", "ZIP local entry disagrees with directory");
    }
    const localNameLength = uint16(view, localOffset + 26);
    const localExtraLength = uint16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressed > directoryStart) fail("INVALID_ARCHIVE", "ZIP compressed data is out of bounds");
    let localName: string;
    try {
      localName = decoder.decode(archive.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    } catch {
      fail("INVALID_ARCHIVE", "ZIP contains an invalid local filename");
    }
    if (localName !== rawName) fail("INVALID_ARCHIVE", "ZIP entry names disagree");
    offset = next;
  }
  if (offset !== directoryStart + directoryLength) fail("INVALID_ARCHIVE", "ZIP directory size disagrees");
  let extracted: Record<string, Uint8Array>;
  try {
    extracted = unzipSync(archive);
  } catch {
    fail("INVALID_ARCHIVE", "ZIP extraction failed");
  }
  const extractedByName = new Map(Object.entries(extracted).map(([raw, content]) => [normalizePath(raw), content]));
  return names.map((name) => {
    const content = extractedByName.get(name);
    if (!content || content.length !== declaredSizes.get(name)) fail("INVALID_ARCHIVE", `ZIP entry size disagrees: ${name}`);
    return { relativePath: name, bytes: content };
  });
}

export async function buildImportManifest(entries: ImportFile[]): Promise<ImportManifest> {
  if (entries.length === 0) fail("NO_PRIMARY_MODEL", "No files were provided");
  const zipEntries = entries.filter((entry) => extension(entry.relativePath) === ".zip");
  if (zipEntries.length > 0 && (zipEntries.length !== 1 || entries.length !== 1)) {
    fail("INVALID_ARCHIVE", "Import one ZIP or direct files, not both");
  }
  const archive = zipEntries.length
    ? { relativePath: validateName(zipEntries[0].relativePath, true), bytes: zipEntries[0].bytes }
    : undefined;
  const files = zipEntries.length ? expandZip(zipEntries[0].bytes) : entries;
  const normalized: ImportFile[] = [];
  const seen = new Set<string>();
  for (const entry of files) {
    const relativePath = validateName(entry.relativePath);
    const folded = relativePath.toLocaleLowerCase("en-US");
    if (seen.has(folded)) fail("INVALID_PATH", `Duplicate import path: ${relativePath}`);
    seen.add(folded);
    const ext = extension(relativePath);
    // jsdom uploads can carry a Uint8Array from another realm; Buffer normalizes it
    // for file-type's Node-side instanceof check.
    const signature = await fileTypeFromBuffer(Buffer.from(entry.bytes));
    if (signature && expectedMime[ext] && signature.mime !== expectedMime[ext]) {
      fail("INVALID_FILE", `File signature does not match extension: ${relativePath}`);
    }
    if (ext === ".glb" && (entry.bytes.length < 4 || decoder.decode(entry.bytes.subarray(0, 4)) !== "glTF")) {
      fail("INVALID_FILE", `Invalid GLB header: ${relativePath}`);
    }
    if (ext === ".gltf") {
      try {
        const document: unknown = JSON.parse(decoder.decode(entry.bytes));
        if (!document || typeof document !== "object" || !("asset" in document) || !document.asset || typeof document.asset !== "object" || !("version" in document.asset) || typeof document.asset.version !== "string" || !document.asset.version.startsWith("2.")) {
          fail("INVALID_FILE", `Unsupported glTF version: ${relativePath}`);
        }
      } catch (error) {
        if (error instanceof AssetImportError) throw error;
        fail("INVALID_FILE", `Invalid glTF JSON: ${relativePath}`);
      }
    }
    if (ext === ".obj") {
      try { decoder.decode(entry.bytes); } catch { fail("INVALID_FILE", `Malformed OBJ model: ${relativePath}`); }
    }
    if (ext === ".fbx") validateFbx(entry);
    normalized.push({ relativePath, bytes: entry.bytes });
  }
  const models = normalized.filter((entry) => modelExtensions.has(extension(entry.relativePath)));
  if (!models.length) fail("NO_PRIMARY_MODEL", "Import contains no glTF or GLB model");
  if (models.length > 1) throw new AssetImportError("AMBIGUOUS_PRIMARY_MODEL", "Select one primary model", models.map((entry) => entry.relativePath));
  const byPath = new Map(normalized.map((entry) => [entry.relativePath, entry]));
  if (extension(models[0].relativePath) === ".obj") validateObjDependencies(models[0], byPath);
  return {
    primaryModel: models[0],
    archive,
    dependencies: normalized.filter((entry) => !modelExtensions.has(extension(entry.relativePath)) && !attributionExtensions.has(extension(entry.relativePath))),
    attributionFiles: normalized.filter((entry) => attributionExtensions.has(extension(entry.relativePath))),
    thumbnails: normalized.filter((entry) => imageExtensions.has(extension(entry.relativePath))),
    warnings: [],
  };
}
