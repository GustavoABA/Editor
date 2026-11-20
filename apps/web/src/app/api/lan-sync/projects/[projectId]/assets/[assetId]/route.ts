import { Readable } from "node:stream";
import {
  assetFileStat, assetFileStream, authorizeSync, finalizeAsset,
  getAssetRecord, isRecord, listReceivedParts, storeChunk,
} from "@/lan-sync/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string; assetId: string }> };

export async function GET(request: Request, { params }: Context) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  try {
    const { projectId, assetId } = await params;
    const info = await getAssetRecord(projectId, assetId);
    const url = new URL(request.url);
    if (url.searchParams.get("download") !== "1") {
      return Response.json({ uploaded: Boolean(info), info, parts: info ? [] : await listReceivedParts(projectId, assetId) });
    }
    if (!info) return new Response("Original not uploaded", { status: 404 });
    const stats = await assetFileStat(projectId, assetId);
    const webStream = Readable.toWeb(assetFileStream(projectId, assetId)) as unknown as ReadableStream;
    return new Response(webStream, {
      headers: {
        "Content-Type": info.mimeType || "application/octet-stream",
        "Content-Length": String(stats.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
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
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 || declaredSize > 8 * 1024 * 1024) {
    return Response.json({ error: "Chunk must be 1-8 MB" }, { status: 413 });
  }
  try {
    const { projectId, assetId } = await params;
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength !== declaredSize) throw new Error("Chunk length mismatch");
    await storeChunk(projectId, assetId, part, bytes);
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
    const info = await finalizeAsset({
      projectId, assetId,
      name: raw.name as string,
      type: raw.type as string,
      mimeType: raw.mimeType as string,
      size: raw.size as number,
      parts: raw.parts as number,
    });
    return Response.json({ uploaded: true, info });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not finalize asset" }, { status: 400 });
  }
}
