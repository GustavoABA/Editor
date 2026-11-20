import { expect, test } from "bun:test";
import { parseLoudnormStats, planLoudnessGain } from "./loudness";

test("parse EBU R128 JSON emitted in FFmpeg stderr", () => {
  const data = parseLoudnormStats('test\n[Parsed_loudnorm_0] {\n"input_i" : "-24.30",\n"input_tp" : "-3.20",\n"input_lra" : "8.00"\n}\n');
  expect(data.inputI).toBe(-24.3);
  expect(data.inputTp).toBe(-3.2);
  expect(data.inputLra).toBe(8);
});

test("avoid exceeding measured true peak even when target LUFS cannot be reached", () => {
  const r = planLoudnessGain({ measurement: { inputI: -24, inputTp: -2, inputLra: 7 },
    targetLufs: -16, maxTruePeakDb: -1.5 });
  expect(r.gainDb).toBe(0.5);
  expect(r.limitedByPeak).toBe(true);
  expect(r.expectedLufs).toBe(-23.5);
});

test("do not invent gain for silence", () => {
  expect(() => planLoudnessGain({ measurement: { inputI: -Infinity, inputTp: -Infinity, inputLra: 0 },
    targetLufs: -16, maxTruePeakDb: -1.5 })).toThrow();
});
