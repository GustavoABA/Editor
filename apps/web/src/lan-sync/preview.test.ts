import { expect, test } from "bun:test";
import { previewArguments, previewFormat } from "./preview";

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
    extension: "m4a", mimeType: "audio/mp4",
  });
  expect(previewFormat({ type: "image", mimeType: "image/jpeg" })).toEqual({
    extension: "png", mimeType: "image/png",
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
