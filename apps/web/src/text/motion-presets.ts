import type { ElementRef, TextElement } from "@/timeline";
import type { AnimationInterpolation } from "@/animation/types";

/** Built exclusively from existing keyframe paths, so edits are previewed and exported. */
export type TextMotionPreset = "fade" | "slide" | "scale";
export type TextMotionPosition = "entrance" | "exit" | "both";
export type TextMotionKeyframe = {
  trackId: string;
  elementId: string;
  propertyPath: string;
  time: number;
  value: number;
  interpolation: AnimationInterpolation;
};

export function getTextAnimationKeyframes({
  ref, element, durationTicks, transitionTicks, motion, position,
}: {
  ref: ElementRef;
  element: TextElement;
  durationTicks: number;
  transitionTicks: number;
  motion: TextMotionPreset;
  position: TextMotionPosition;
}): TextMotionKeyframe[] {
  const duration = Math.max(1, Math.round(durationTicks));
  const fade = Math.max(1, Math.min(Math.round(transitionTicks), Math.floor(duration / 2)));
  const exitStart = Math.max(fade, duration - fade);
  const opacity = typeof element.params.opacity === "number" ? element.params.opacity : 1;
  const y = typeof element.params["transform.positionY"] === "number" ? element.params["transform.positionY"] : 0;
  const scaleX = typeof element.params["transform.scaleX"] === "number" ? element.params["transform.scaleX"] : 1;
  const scaleY = typeof element.params["transform.scaleY"] === "number" ? element.params["transform.scaleY"] : 1;
  const keys: TextMotionKeyframe[] = [];
  const push = (propertyPath: string, time: number, value: number) => keys.push({
    ...ref, propertyPath, time, value, interpolation: "linear",
  });

  if (position !== "exit") {
    push("opacity", 0, 0);
    push("opacity", fade, opacity);
    if (motion === "slide") {
      push("transform.positionY", 0, y + 55);
      push("transform.positionY", fade, y);
    } else if (motion === "scale") {
      push("transform.scaleX", 0, scaleX * 0.82);
      push("transform.scaleY", 0, scaleY * 0.82);
      push("transform.scaleX", fade, scaleX);
      push("transform.scaleY", fade, scaleY);
    }
  }
  if (position !== "entrance") {
    if (position === "exit") push("opacity", 0, opacity);
    push("opacity", exitStart, opacity);
    push("opacity", duration, 0);
    if (motion === "slide") {
      if (position === "exit") push("transform.positionY", 0, y);
      push("transform.positionY", exitStart, y);
      push("transform.positionY", duration, y - 55);
    } else if (motion === "scale") {
      if (position === "exit") {
        push("transform.scaleX", 0, scaleX);
        push("transform.scaleY", 0, scaleY);
      }
      push("transform.scaleX", exitStart, scaleX);
      push("transform.scaleY", exitStart, scaleY);
      push("transform.scaleX", duration, scaleX * 0.82);
      push("transform.scaleY", duration, scaleY * 0.82);
    }
  }
  // Avoid duplicate times on very short caption clips; prefer the later value.
  const deduplicated = new Map<string, TextMotionKeyframe>();
  for (const key of keys) deduplicated.set(key.propertyPath + ":" + key.time, key);
  return [...deduplicated.values()];
}
