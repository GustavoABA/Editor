import type { TCanvasSize } from "@/project/types";
import type { SceneTracks, TimelineElement } from "@/timeline";

export type ReframeMode = "contain" | "cover";
export type ReframeUpdate = { trackId: string; elementId: string; patch: Partial<TimelineElement> };

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Non-destructive, predictable geometry-only reframe.
 * Does not pretend to detect a subject's face or to solve motion tracking.
 */
export function createReframeUpdates(args: {
  tracks: SceneTracks;
  from: TCanvasSize;
  to: TCanvasSize;
  mode: ReframeMode;
}): { updates: ReframeUpdate[]; protectedCount: number; animatedCount: number } {
  const { tracks, from, to, mode } = args;
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) {
    throw new Error("Canvas dimensions must be positive");
  }
  const ratioX = to.width / from.width;
  const ratioY = to.height / from.height;
  const updates: ReframeUpdate[] = [];
  let protectedCount = 0;
  let animatedCount = 0;
  for (const track of [tracks.main, ...tracks.overlay, ...tracks.audio]) {
    for (const element of track.elements) {
      if (element.locked) { protectedCount++; continue; }
      if (!["video", "image", "text", "sticker", "graphic"].includes(element.type)) continue;
      const params = element.params;
      const oldX = typeof params["transform.positionX"] === "number" ? params["transform.positionX"] : 0;
      const oldY = typeof params["transform.positionY"] === "number" ? params["transform.positionY"] : 0;
      const oldScaleX = typeof params["transform.scaleX"] === "number" ? params["transform.scaleX"] : 1;
      const oldScaleY = typeof params["transform.scaleY"] === "number" ? params["transform.scaleY"] : 1;
      const scaling = element.type === "video" || element.type === "image"
        ? (mode === "cover" ? Math.max(ratioX, ratioY) : Math.min(ratioX, ratioY))
        : Math.min(ratioX, ratioY);
      // Clamp anchor position to a modest safe area. Rotation is preserved.
      const nextX = clamp(oldX * ratioX, -to.width * 0.45, to.width * 0.45);
      const nextY = clamp(oldY * ratioY, -to.height * 0.45, to.height * 0.45);
      if (element.animations) animatedCount++;
      updates.push({
        trackId: track.id, elementId: element.id,
        patch: {
          params: {
            ...params,
            "transform.positionX": nextX,
            "transform.positionY": nextY,
            "transform.scaleX": oldScaleX * scaling,
            "transform.scaleY": oldScaleY * scaling,
          },
        },
      });
    }
  }
  return { updates, protectedCount, animatedCount };
}
