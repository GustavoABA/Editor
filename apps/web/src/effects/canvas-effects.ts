import type { Effect } from "./types";

type EffectSurfaces = {
  key: string;
  width: number;
  height: number;
  surfaces: OffscreenCanvas[];
  reduced: Map<string, OffscreenCanvas>;
};

// MediaBunny recycles a small pool of decoded canvases. Keep the effect
// surfaces alongside each source canvas rather than allocating one (or more)
// full-resolution canvases every animation frame. WeakMap makes their lifetime
// follow the decoder/image source and prevents an unbounded global cache.
const effectSurfaceCache = new WeakMap<object, EffectSurfaces>();

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

  const cacheKey = JSON.stringify(active.map((effect) => ({
    type: effect.type,
    params: effect.params,
  })));
  const cacheOwner = source as object;
  const cached = effectSurfaceCache.get(cacheOwner);
  const reusable = cached && cached.key === cacheKey && cached.width === width && cached.height === height;
  const surfaces = reusable
    ? cached.surfaces
    : Array.from({ length: active.length }, () => new OffscreenCanvas(width, height));
  if (surfaces.length !== active.length) {
    surfaces.length = active.length;
    for (let index = 0; index < active.length; index++) {
      if (!surfaces[index]) surfaces[index] = new OffscreenCanvas(width, height);
    }
  }
  const reduced = reusable ? cached.reduced : new Map<string, OffscreenCanvas>();
  if (!reusable) {
    effectSurfaceCache.set(cacheOwner, { key: cacheKey, width, height, surfaces, reduced });
  }

  let current: CanvasImageSource = source;
  for (const [index, effect] of active.entries()) {
    const canvas = surfaces[index];
    const ctx = canvas.getContext("2d", { willReadFrequently: effect.type === "grayscale" });
    if (!ctx) continue;
    ctx.clearRect(0, 0, width, height);
    switch (effect.type) {
      case "pixelate": {
        // Deliberately remove spatial detail for censoring: nearest-neighbor
        // pixels, never CSS transform on the scene or a freeze-frame overlay.
        const px = Number(effect.params.pixelSize ?? 24);
        const block = Math.max(2, Math.min(200, Number.isFinite(px) ? Math.round(px) : 24));
        const smallWidth = Math.max(1, Math.ceil(width / block));
        const smallHeight = Math.max(1, Math.ceil(height / block));
        const reducedKey = `${index}:${smallWidth}x${smallHeight}`;
        const reducedCanvas = reduced.get(reducedKey) ?? new OffscreenCanvas(smallWidth, smallHeight);
        reduced.set(reducedKey, reducedCanvas);
        const reducedCtx = reducedCanvas.getContext("2d");
        if (!reducedCtx) { ctx.drawImage(current, 0, 0, width, height); break; }
        reducedCtx.clearRect(0, 0, smallWidth, smallHeight);
        reducedCtx.imageSmoothingEnabled = true;
        reducedCtx.drawImage(current, 0, 0, smallWidth, smallHeight);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(reducedCanvas, 0, 0, width, height);
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
