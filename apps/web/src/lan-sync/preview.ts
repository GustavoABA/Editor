import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { assetFilePath, getAssetRecord, type AssetRecord } from "./server";

const MAX_PREVIEW_BYTES = 80 * 1024 * 1024;
const TRANSCODE_TIMEOUT_MS = 5 * 60 * 1000;
const running = new Map<string, Promise<PreviewAsset>>();

export type PreviewAsset = { filePath: string; mimeType: string; size: number };

export function previewFormat(info: Pick<AssetRecord, "type" | "mimeType">): { extension: string; mimeType: string } {
  if (info.type === "video") return { extension: "mp4", mimeType: "video/mp4" };
  if (info.type === "audio") return { extension: "m4a", mimeType: "audio/mp4" };
  if (info.type === "image" && info.mimeType !== "image/gif" && info.mimeType !== "image/svg+xml") {
    return { extension: "png", mimeType: "image/png" };
  }
  throw new Error("Preview unavailable for this media type");
}

export function previewArguments(info: Pick<AssetRecord, "type">, source: string, output: string): string[] {
  const common = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", source];
  if (info.type === "video") {
    return [...common,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", "scale=854:480:force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "32",
      "-maxrate", "350k", "-bufsize", "700k", "-pix_fmt", "yuv420p",
      "-r", "24", "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart",
      "-f", "mp4", output,
    ];
  }
  if (info.type === "audio") {
    return [...common, "-vn", "-c:a", "aac", "-b:a", "48k", "-f", "ipod", output];
  }
  if (info.type === "image") {
    return [...common, "-vf", "scale=1280:1280:force_original_aspect_ratio=decrease",
      "-frames:v", "1", "-update", "1", "-f", "image2", output];
  }
  throw new Error("Invalid preview type");
}

function transcode(source: string, output: string, info: AssetRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", previewArguments(info, source, output), {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => child.kill("SIGKILL"), TRANSCODE_TIMEOUT_MS);
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 2048) stderr += chunk.toString("utf8").slice(0, 2048 - stderr.length);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(stderr || "FFmpeg could not generate proxy"));
    });
  });
}

/** Transcode an optional small viewing copy on the host; the verified original is never modified. */
export async function ensurePreview(projectId: string, assetId: string): Promise<PreviewAsset> {
  const info = await getAssetRecord(projectId, assetId);
  if (!info) throw new Error("Original not verified on the host");
  const format = previewFormat(info);
  const source = assetFilePath(projectId, assetId);
  const target = source + ".preview." + format.extension;
  const key = projectId + ":" + assetId;
  const existing = running.get(key);
  if (existing) return existing;

  const job = (async () => {
    const cached = await stat(target).catch(() => null);
    if (cached?.isFile() && cached.size > 0 && cached.size <= MAX_PREVIEW_BYTES) {
      return { filePath: target, mimeType: format.mimeType, size: cached.size };
    }
    const tmp = path.join(path.dirname(target), "preview-" + randomUUID() + "." + format.extension);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await transcode(source, tmp, info);
      const output = await stat(tmp);
      if (output.size === 0 || output.size > MAX_PREVIEW_BYTES) {
        throw new Error("Proxy too large for browser cache; segmented streaming is required");
      }
      await rename(tmp, target);
      return { filePath: target, mimeType: format.mimeType, size: output.size };
    } finally {
      await rm(tmp, { force: true }).catch(() => undefined);
    }
  })();
  running.set(key, job);
  try { return await job; }
  finally { running.delete(key); }
}
