import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { AssetStorage } from "@/lib/storage/types";
import { parseStorageKey } from "@/lib/storage/storage-key";
import type { AssetDetail } from "@/features/assets/infrastructure/asset-repository";

type Session = { user: { id: string } } | null;
type Context = { params: Promise<{ assetId: string }> };
const baseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Accept-Ranges": "bytes",
};

function parseRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    end = Math.min(end, size - 1);
  }
  if (start < 0 || start >= size || end < start) return null;
  return { start, end };
}

export function createFileHandler(deps: {
  getSession: (headers: Headers) => Promise<Session>;
  getAsset: (assetId: string, ownerId: string) => Promise<AssetDetail | null>;
  storage: AssetStorage;
}) {
  return async function GET(request: Request, context: Context): Promise<Response> {
    const session = await deps.getSession(request.headers);
    if (!session) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
    const { assetId } = await context.params;
    const key = new URL(request.url).searchParams.get("key");
    if (!key) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    const asset = await deps.getAsset(assetId, session.user.id);
    const file = asset?.status === "ready" ? [...asset.files, ...(asset.retainedFiles ?? [])].find((entry) => entry.storageKey === key) : undefined;
    if (!file) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    let path: string;
    let size: number;
    try {
      path = deps.storage.processingPath(parseStorageKey(file.storageKey));
      size = (await stat(path)).size;
      if (size !== file.byteSize) throw new Error("Stored file size disagrees with manifest");
    } catch {
      return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    }
    const rangeValue = request.headers.get("range");
    const range = rangeValue ? parseRange(rangeValue, size) : null;
    if (rangeValue && !range) return new Response(null, { status: 416, headers: { ...baseHeaders, "Content-Range": `bytes */${size}` } });
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    const source = createReadStream(path, size ? { start, end } : undefined);
    const body = Readable.toWeb(source) as ReadableStream<Uint8Array>;
    const headers = new Headers({
      ...baseHeaders,
      "Content-Type": file.mimeType,
      "Content-Length": String(range ? end - start + 1 : size),
    });
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    return new Response(body, { status: range ? 206 : 200, headers });
  };
}
