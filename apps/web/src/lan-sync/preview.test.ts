import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
const base = await mkdtemp(path.join(tmpdir(), "opencut-proxy-test-"));
process.env.LAN_SYNC_DIR = base;
process.env.LAN_SYNC_TOKEN = "test-only-secret-over-16-characters";
const { ensurePreview, previewArguments, previewFormat } = await import("./preview");
const { finalizeAsset, storeChunk } = await import("./server");

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

test("remote video preview targets a compact browser-compatible MP4", () => {
  const format = previewFormat({ type: "video", mimeType: "video/quicktime" });
  expect(format).toEqual({ extension: "mp4", mimeType: "video/mp4" });
  const args = previewArguments({ type: "video" }, "/tmp/source.mov", "/tmp/proxy.mp4");
  expect(args).toContain("libx264");
  expect(args).toContain("scale=854:480:force_original_aspect_ratio=decrease:force_divisible_by=2");
  expect(args.at(-1)).toBe("/tmp/proxy.mp4");
  expect(args).not.toContain("pipe:1");
});

test("audio and still image proxies preserve asset categories", () => {
  expect(previewFormat({ type: "audio", mimeType: "audio/wav" })).toEqual({
    extension: "m4a",
    mimeType: "audio/mp4",
  });
  expect(previewFormat({ type: "image", mimeType: "image/jpeg" })).toEqual({
    extension: "png",
    mimeType: "image/png",
  });
  const audioArgs = previewArguments({ type: "audio" }, "source.wav", "proxy.m4a");
  expect(audioArgs).toContain("48k");
  const imageArgs = previewArguments({ type: "image" }, "source.png", "proxy.png");
  expect(imageArgs).toContain("-frames:v");
});

test("unsupported animated/vector previews do not silently destroy their originals", () => {
  expect(() => previewFormat({ type: "image", mimeType: "image/svg+xml" })).toThrow();
  expect(() => previewFormat({ type: "image", mimeType: "image/gif" })).toThrow();
  expect(() => previewFormat({ type: "invalid", mimeType: "application/octet-stream" })).toThrow();
});

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffmpegInstalled = spawnSync(ffmpeg, ["-version"], { timeout: 10_000 }).status === 0;
if (ffmpegInstalled) {
  test("FFmpeg generates a real compact proxy while keeping the original unchanged", async () => {
    const projectId = "proxy_" + randomUUID();
    const assetId = "video_" + randomUUID();
    const original = path.join(tmpdir(), "opencut-preview-fixture-" + randomUUID() + ".mp4");
    const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:r=5", "-t", "0.4", "-an", "-c:v", "mpeg4", "-y", original], { timeout: 30_000 });
    expect(result.status).toBe(0);
    const source = await readFile(original);
    const checksum = createHash("sha256").update(source).digest("hex");
    await storeChunk(projectId, assetId, 0, Uint8Array.from(source).buffer, checksum);
    await finalizeAsset({
      projectId,
      assetId,
      name: "source.mp4",
      type: "video",
      mimeType: "video/mp4",
      size: source.length,
      parts: 1,
      chunkSha256: [checksum],
    });
    const proxy = await ensurePreview(projectId, assetId);
    expect(proxy.mimeType).toBe("video/mp4");
    expect((await stat(proxy.filePath)).size).toBeGreaterThan(0);
    const second = await ensurePreview(projectId, assetId);
    expect(second.filePath).toBe(proxy.filePath);
    const keptOriginal = await readFile(path.join(path.dirname(proxy.filePath), "original"));
    expect(keptOriginal.equals(source)).toBe(true);
  });
} else {
  test.skip("FFmpeg integration (binary unavailable on runner)", () => undefined);
}
