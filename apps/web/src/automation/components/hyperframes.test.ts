import { expect, test } from "bun:test";
// Audio peak analysis is exported from the component for reuse and integration testing.
import { findAudioPeaks } from "./hyperframes";
test("detect distinct peaks and reject silent timeline", () => {
  const data = new Float32Array(16_000 * 2);
  for (let i = 16_000 * 0.5; i < 16_000 * 0.65; i++) data[i] = 0.75;
  for (let i = 16_000 * 1.4; i < 16_000 * 1.55; i++) data[i] = 0.9;
  expect(findAudioPeaks(data, 16_000).length).toBeGreaterThanOrEqual(1);
  expect(findAudioPeaks(new Float32Array(16_000), 16_000)).toEqual([]);
});
