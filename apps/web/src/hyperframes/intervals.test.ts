import { expect, test } from "bun:test";
import { planHyperFramesIntervals, formatTimelineDuration } from "./intervals";
test("zero means all remaining timeline; slices retain full coverage",()=> {
  const parts=planHyperFramesIntervals(5,0,70);
  expect(parts.length).toBe(6);
  expect(parts[0].start).toBe(5);
  expect(parts.at(-1)!.start+parts.at(-1)!.duration).toBeCloseTo(70,7);
  expect(parts.every(p=>p.duration>=0.3&&p.duration<=12)).toBe(true);
});
test("requested interval cannot exceed timeline",()=> {
  expect(planHyperFramesIntervals(30,50,35)).toEqual([{start:30,duration:5}]);
  expect(planHyperFramesIntervals(0,10,20)).toEqual([{start:0,duration:10}]);
});
test("invalid interval and tiny tail",()=> {
  expect(planHyperFramesIntervals(10,0,10)).toEqual([]);
  expect(planHyperFramesIntervals(0,-1,10)).toEqual([]);
  expect(planHyperFramesIntervals(0,0,12.1).every(p=>p.duration>=0.3&&p.duration<=12)).toBe(true);
  expect(formatTimelineDuration(125)).toBe("2m 05s");
});
