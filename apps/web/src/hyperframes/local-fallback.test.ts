import { expect, test } from "bun:test";
import { createLocalHyperFramesFallback } from "./local-fallback";

test("local HyperFrames fallback produces escaped animated purple composition", () => {
  const result = createLocalHyperFramesFallback({
    instruction: "Animação roxa e azul",
    transcript: "<script>não execute</script> uma mensagem importante",
  });
  expect(result.html).toContain("&lt;script&gt;");
  expect(result.html).not.toContain("<script>");
  expect(result.css).toContain("#8b5cf6");
  expect(result.css).toContain("@keyframes");
});
