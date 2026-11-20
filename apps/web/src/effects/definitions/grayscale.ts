import type { EffectDefinition } from "@/effects/types";

/** Black-and-white / grayscale applied only on the selected visual clip. */
export const grayscaleEffectDefinition: EffectDefinition = {
  type: "grayscale",
  name: "Preto e branco",
  keywords: ["grayscale", "black and white", "monochrome", "desaturate", "cinza"],
  params: [{
    key: "intensity", label: "Intensidade", type: "number",
    default: 100, min: 0, max: 100, step: 1,
  }],
  renderer: { passes: [] },
};
