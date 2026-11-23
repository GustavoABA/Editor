import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { ensurePreview } from "@/lan-sync/preview";
import { assetFileStat, assetFileStream, authorizeSync, finalizeAsset, getAssetRecord, isRecord, listReceivedParts, parseByteRange, storeChunk } from "@/lan-sync/server";

/* eslint-disable opencut/prefer-object-params -- Next.js route handlers require (request, context). */

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string; assetId: string }> };

function rangedFileResponse(args: { request: Request; size: number; mimeType: string; stream: (range?: { start: number; end: number }) => Readable }): Response {
  let range;
  try {
    range = parseByteRange({
      header: args.request.headers.get("range"),
      size: args.size,
    });
  } catch {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${args.size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }
  // Node and DOM expose the same WHATWG stream at runtime; their library declarations differ.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const webStream = Readable.toWeb(args.stream(range ? { start: range.start, end: range.end } : undefined)) as unknown as globalThis.ReadableStream<Uint8Array>;
  return new Response(webStream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": args.mimeType,
      "Content-Length": String(range?.length ?? args.size),
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${args.size}` } : {}),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request, { params }: Context) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  try {
    const { projectId, assetId } = await params;
    const info = await getAssetRecord(projectId, assetId);
    const url = new URL(request.url);
    if (url.searchParams.get("preview") === "1") {
      if (!info) return new Response("Original not uploaded", { status: 404 });
      try {
        const proxy = await ensurePreview(projectId, assetId);
        return rangedFileResponse({
          request,
          size: proxy.size,
          mimeType: proxy.mimeType,
          stream: (range) => createReadStream(proxy.filePath, range),
        });
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Preview could not be generated",
          },
          { status: 422 },
        );
      }
    }
    if (url.searchParams.get("download") !== "1") {
      return Response.json({
        uploaded: Boolean(info),
        info,
        parts: info ? [] : await listReceivedParts(projectId, assetId),
      });
    }
    if (!info) return new Response("Original not uploaded", { status: 404 });
    const stats = await assetFileStat(projectId, assetId);
    return rangedFileResponse({
      request,
      size: stats.size,
      mimeType: info.mimeType || "application/octet-stream",
      stream: (range) => assetFileStream(projectId, assetId, range),
    });
  } catch {
    return Response.json({ error: "Asset not found or invalid" }, { status: 404 });
  }
}

export async function PUT(request: Request, { params }: Context) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  const part = Number(new URL(request.url).searchParams.get("part"));
  const declaredSize = Number(request.headers.get("content-length"));
  const checksum = request.headers.get("x-content-sha256");
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 || declaredSize > 8 * 1024 * 1024) {
    return Response.json({ error: "Chunk must be 1-8 MB" }, { status: 413 });
  }
  if (!checksum || !/^[a-f0-9]{64}$/.test(checksum)) {
    return Response.json({ error: "A valid x-content-sha256 header is required" }, { status: 400 });
  }
  try {
    const { projectId, assetId } = await params;
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength !== declaredSize) throw new Error("Chunk length mismatch");
    await storeChunk(projectId, assetId, part, bytes, checksum);
    return Response.json({ ok: true, part });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Cannot upload chunk" }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: Context) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  try {
    const { projectId, assetId } = await params;
    const raw: unknown = await request.json();
    if (!isRecord(raw)) return Response.json({ error: "Invalid asset metadata" }, { status: 400 });
    const chunkSha256 = Array.isArray(raw.chunkSha256) ? raw.chunkSha256.filter((value): value is string => typeof value === "string") : [];
    if (typeof raw.name !== "string" || typeof raw.type !== "string" || typeof raw.mimeType !== "string" || typeof raw.size !== "number" || typeof raw.parts !== "number" || !Array.isArray(raw.chunkSha256) || chunkSha256.length !== raw.chunkSha256.length) {
      return Response.json({ error: "Invalid asset metadata" }, { status: 400 });
    }
    const info = await finalizeAsset({
      projectId,
      assetId,
      name: raw.name,
      type: raw.type,
      mimeType: raw.mimeType,
      size: raw.size,
      parts: raw.parts,
      chunkSha256,
    });
    return Response.json({ uploaded: true, info });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not finalize asset",
      },
      { status: 400 },
    );
  }
}
