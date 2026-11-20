import { expect, test } from "bun:test";
import { v7ToV8 } from "./v7-to-v8";

test("migrate untouched S/Q/W defaults to C/V/X", () => {
  const result = v7ToV8({ state: { keybindings: { s: "split", q: "split-left", w: "split-right" }, isCustomized: false } }) as
    { keybindings: Record<string, string>; isCustomized: boolean };
  expect(result.keybindings.c).toBe("split");
  expect(result.keybindings.v).toBe("split-left");
  expect(result.keybindings.x).toBe("split-right");
  expect(result.keybindings.s).toBeUndefined();
  expect(result.keybindings.q).toBeUndefined();
  expect(result.keybindings.w).toBeUndefined();
});

test("do not change customized profiles", () => {
  const custom = { keybindings: { s: "split", x: "stop-playback" }, isCustomized: true };
  expect(v7ToV8({ state: custom })).toEqual(custom);
});
