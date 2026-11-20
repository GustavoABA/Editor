import { expect, test } from "bun:test";
import { createReframeUpdates } from "./reframe";
import type { SceneTracks } from "./types";

test("reframe returns transforms and preserves protected clips", () => {
  const tracks = {
    main: { id: "main", elements: [
      { id: "video-a", type: "video", params: { "transform.positionX": 100,
        "transform.positionY": 70, "transform.scaleX": 1, "transform.scaleY": 1 } },
      { id: "video-b", type: "video", locked: true, params: {} },
    ] }, overlay: [], audio: [],
  } as unknown as SceneTracks;
  const result = createReframeUpdates({
    tracks, from: { width: 1920, height: 1080 },
    to: { width: 1080, height: 1920 }, mode: "contain",
  });
  expect(result.protectedCount).toBe(1);
  expect(result.updates).toHaveLength(1);
  expect(result.updates[0].elementId).toBe("video-a");
  expect(result.updates[0].patch.params?.["transform.scaleX"]).toBeCloseTo(0.5625);
});
