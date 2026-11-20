import type { Effect } from "./types";

/**
 * Effects are rendered on the visual clip's own pixels BEFORE placement on the
 * scene canvas. Works in both preview and server-render, with or without WebGPU.
 * The original file and the timeline clip remain untouched.
 */
export function applyCanvasClipEffects({
  source, width, height, effects,
}: {
  source: CanvasImageSource;
  width: number;
  height: number;
  effects: Effect[] | undefined;
}): CanvasImageSource {
  const active = (effects || []).filter((effect) => effect.enabled &&
    ["pixelate", "grayscale", "blur"].includes(effect.type));
  if (!active.length || width < 1 || height < 1) return source;

  let current: CanvasImageSource = source;
  for (const effect of active) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: effect.type === "grayscale" });
    if (!ctx) continue;
    switch (effect.type) {
      case "pixelate": {
        // Deliberately remove spatial detail for censoring: nearest-neighbor
        // pixels, never CSS transform on the scene or a freeze-frame overlay.
        const px = Number(effect.params.pixelSize ?? 24);
        const block = Math.max(2, Math.min(200, Number.isFinite(px) ? Math.round(px) : 24));
        const smallWidth = Math.max(1, Math.ceil(width / block));
        const smallHeight = Math.max(1, Math.ceil(height / block));
        const reduced = new OffscreenCanvas(smallWidth, smallHeight);
        const reducedCtx = reduced.getContext("2d");
        if (!reducedCtx) { ctx.drawImage(current, 0, 0, width, height); break; }
        reducedCtx.imageSmoothingEnabled = true;
        reducedCtx.drawImage(current, 0, 0, smallWidth, smallHeight);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(reduced, 0, 0, width, height);
        break;
      }
      case "grayscale": {
        const intensity = Number(effect.params.intensity ?? 100);
        const strength = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity / 100 : 1));
        // Chromium, used by browser preview and the host renderer, supports
        // canvas filters. Prefer that fast native path over reading millions
        // of RGBA pixels back into JS on every video frame.
        if (typeof ctx.filter === "string") {
          ctx.filter = `grayscale(${strength * 100}%)`;
          ctx.drawImage(current, 0, 0, width, height);
          ctx.filter = "none";
          break;
        }
        ctx.drawImage(current, 0, 0, width, height);
        if (strength === 0) break;
        const frame = ctx.getImageData(0, 0, width, height);
        const data = frame.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          data[i] += (gray - data[i]) * strength;
          data[i + 1] += (gray - data[i + 1]) * strength;
          data[i + 2] += (gray - data[i + 2]) * strength;
        }
        ctx.putImageData(frame, 0, 0);
        break;
      }
      case "blur": {
        const intensity = Number(effect.params.intensity ?? 15);
        const radius = Math.max(0, Math.min(60, Number.isFinite(intensity) ? intensity / 2 : 8));
        ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(current, 0, 0, width, height);
        ctx.filter = "none";
        break;
      }
    }
    current = canvas;
  }
  return current;
}
