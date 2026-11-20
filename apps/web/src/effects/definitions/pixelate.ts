import type { EffectDefinition } from "@/effects/types";

/** Pixelation is applied before compositing to individual clip pixels. */
export const pixelateEffectDefinition: EffectDefinition = {
  type: "pixelate",
  name: "Pixelate (censura)",
  keywords: ["pixel", "pixelate", "mosaico", "censura", "blur", "quadrado"],
  params: [{
    key: "pixelSize", label: "Tamanho dos pixels", type: "number",
    default: 24, min: 2, max: 200, step: 1,
  }],
  renderer: { passes: [] },
};
