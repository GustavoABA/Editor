"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import type { ElementRef, TextElement } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";
import { getTextAnimationKeyframes, type TextMotionPreset } from "@/text/motion-presets";

type SelectedText = { ref: ElementRef; element: TextElement };

export function BatchTextProperties({ selected }: { selected: SelectedText[] }) {
  const editor = useEditor();
  const [color, setColor] = useState("#fff2a6");
  const [fontSize, setFontSize] = useState("15");
  const [motion, setMotion] = useState<TextMotionPreset>("fade");
  const [position, setPosition] = useState<"entrance" | "exit" | "both">("both");
  const [transition, setTransition] = useState("0.3");

  const unlocked = selected.filter(({ element }) => !element.locked);
  const updateParam = (name: string, value: string | number) => {
    editor.timeline.updateElements({
      updates: unlocked.map(({ ref, element }) => ({
        trackId: ref.trackId,
        elementId: ref.elementId,
        patch: { params: { ...element.params, [name]: value } },
      })),
    });
    toast.success(`${unlocked.length} texto(s) atualizado(s).`);
  };

  const applyMotion = () => {
    const t = Number(transition);
    if (!Number.isFinite(t) || t < 0.05 || t > 2) return toast.error("Duração entre 0,05s e 2s.");
    const allKeyframes = unlocked.flatMap(({ ref, element }) =>
      getTextAnimationKeyframes({
        ref, element, durationTicks: element.duration,
        transitionTicks: Math.round(t * TICKS_PER_SECOND),
        motion, position,
      }),
    );
    if (!allKeyframes.length) return toast.info("Nenhum clipe compatível para animar.");
    editor.timeline.upsertKeyframes({ keyframes: allKeyframes });
    toast.success(`Animação aplicada a ${unlocked.length} texto(s). Desfaça com Ctrl+Z.`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto rounded-sm border bg-background p-3 space-y-4" aria-label="Edição coletiva de textos">
      <div>
        <h3 className="text-sm font-semibold">Edição coletiva de textos</h3>
        <p className="text-muted-foreground text-xs">{selected.length} textos selecionados · {unlocked.length} editáveis. Use Ctrl/Cmd + clique ou seleção por área para escolher vários.</p>
        <p className="text-muted-foreground text-xs">Aplique somente as propriedades desejadas; conteúdos individuais permanecem intactos.</p>
      </div>
      <label className="flex items-center justify-between gap-2 text-xs">
        Cor de todos os textos
        <input type="color" aria-label="Cor coletiva" value={color} onChange={e=>setColor(e.target.value)} />
        <button type="button" className="rounded border px-2 py-1" disabled={!unlocked.length}
          onClick={() => updateParam("color", color)}>Aplicar cor</button>
      </label>
      <label className="flex items-center justify-between gap-2 text-xs">
        Tamanho de fonte
        <input type="number" min={1} max={100} step={1} value={fontSize}
          className="bg-background w-20 rounded border px-1 py-1" onChange={e=>setFontSize(e.target.value)} />
        <button type="button" className="rounded border px-2 py-1" disabled={!unlocked.length}
          onClick={() => { const n = Number(fontSize); if (n > 0 && n <= 100) updateParam("fontSize", n); }}>Aplicar</button>
      </label>
      <div className="space-y-2 border-t pt-3">
        <h4 className="text-xs font-semibold">Animação de entrada e saída</h4>
        <label className="flex items-center justify-between gap-2 text-xs">
          Efeito
          <select aria-label="Efeito coletivo" className="bg-background rounded border p-1"
            value={motion} onChange={e => setMotion(e.target.value as TextMotionPreset)}>
            <option value="fade">Aparecer / desaparecer</option>
            <option value="slide">Deslizar + transparência</option>
            <option value="scale">Zoom suave + transparência</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-xs">
          Aplicar em
          <select aria-label="Trecho da animação" className="bg-background rounded border p-1"
            value={position} onChange={e=>setPosition(e.target.value as "entrance" | "exit" | "both")}>
            <option value="both">Entrada e saída</option>
            <option value="entrance">Somente entrada</option>
            <option value="exit">Somente saída</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2 text-xs">
          Duração (segundos)
          <input type="number" min={0.05} max={2} step={0.05} value={transition}
            className="bg-background w-20 rounded border px-1 py-1"
            onChange={e=>setTransition(e.target.value)} />
        </label>
        <button type="button" className="w-full rounded border px-3 py-2 text-xs font-medium"
          disabled={!unlocked.length} onClick={applyMotion}>Aplicar animação aos textos selecionados</button>
        <p className="text-muted-foreground text-[11px]">A animação utiliza keyframes reais de opacidade e posição. Cada texto preserva sua duração e posição original.</p>
      </div>
    </div>
  );
}
