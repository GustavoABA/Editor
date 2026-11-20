"use client";

import { useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { UpdateElementsCommand } from "@/commands";
import { getLanToken, lanRequest } from "@/lan-sync/client";
import { clampDb } from "@/timeline/audio-state";
import type { TimelineElement } from "@/timeline";

type Row = {
  trackId: string;
  elementId: string;
  assetId: string;
  name: string;
  currentDb: number;
  lufs: number;
  truePeak: number;
  gainDb: number;
  expectedLufs: number;
  limitedByPeak: boolean;
  selected: boolean;
};

export function AudioNormalizePanel() {
  const editor = useEditor();
  const [target, setTarget] = useState(-16);
  const [maxPeak, setMaxPeak] = useState(-1.5);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);

  const analyze = async () => {
    if (!getLanToken()) { setMessage("Conecte a LAN: originais verificados são necessários para medição EBU R128."); return; }
    cancelled.current = false;
    setBusy(true); setRows([]); setMessage("Preparando análise...");
    const scene = editor.scenes.getActiveScene();
    const items = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio]
      .flatMap((track) => track.elements.flatMap((element) => {
        if (element.locked || !["audio", "video"].includes(element.type) || !("mediaId" in element)) return [];
        return [{ trackId: track.id, element }];
      }));
    const cache = new Map<string, Awaited<ReturnType<typeof measure>>>();
    const found: Row[] = [];
    for (let i = 0; i < items.length; i++) {
      if (cancelled.current) break;
      const { trackId, element } = items[i];
      const mediaAsset = editor.media.getAssets().find((a) => a.id === element.mediaId);
      if (!mediaAsset) continue;
      setMessage(`Medindo ${i + 1}/${items.length}: ${mediaAsset.name}`);
      try {
        let measurement = cache.get(element.mediaId);
        if (!measurement) {
          measurement = await measure(scene.id, editor.project.getActive().metadata.id,
            element.mediaId, target, maxPeak);
          cache.set(element.mediaId, measurement);
        }
        found.push({
          trackId, elementId: element.id, assetId: element.mediaId, name: mediaAsset.name,
          currentDb: typeof element.params.volume === "number" ? element.params.volume : 0,
          lufs: measurement.measurement.inputI,
          truePeak: measurement.measurement.inputTp,
          gainDb: measurement.gainDb, expectedLufs: measurement.expectedLufs,
          limitedByPeak: measurement.limitedByPeak, selected: true,
        });
      } catch (error) {
        setMessage(`⚠️ ${mediaAsset.name}: ${error instanceof Error ? error.message : "Falha na medição"}`);
      }
    }
    setRows(found);
    setMessage(cancelled.current ? "Análise interrompida." : `Analisados ${found.length} clipes. Confira e aplique apenas os desejados.`);
    setBusy(false);
  };

  const apply = () => {
    const scene = editor.scenes.getActiveScene();
    const tracks = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
    const updates: Array<{ trackId: string; elementId: string; patch: Partial<TimelineElement> }> = [];
    for (const row of rows.filter((item) => item.selected)) {
      const track = tracks.find((t) => t.id === row.trackId);
      const element = track?.elements.find((e) => e.id === row.elementId);
      if (!element || element.locked || !["audio", "video"].includes(element.type)) continue;
      const before = typeof element.params.volume === "number" ? element.params.volume : 0;
      updates.push({
        trackId: row.trackId, elementId: row.elementId,
        patch: { params: { ...element.params, volume: clampDb(before + row.gainDb) } },
      });
    }
    if (!updates.length) { setMessage("Nenhum clipe selecionado para aplicar."); return; }
    editor.command.execute({ command: new UpdateElementsCommand({ updates }) });
    setMessage(`Normalização aplicada a ${updates.length} clipe(s). Ctrl+Z desfaz. Meça o mix final antes de publicar.`);
  };

  return (
    <div className="space-y-2 rounded-md border p-2 text-xs">
      <strong>F02 · Normalizar áudio (EBU R128)</strong>
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1">Alvo LUFS
          <input type="number" min={-30} max={-8} step={1} value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="bg-background w-16 rounded border px-1" />
        </label>
        <label className="flex items-center gap-1">Pico dBTP
          <input type="number" min={-9} max={-0.1} step={0.5} value={maxPeak}
            onChange={(e) => setMaxPeak(Number(e.target.value))}
            className="bg-background w-16 rounded border px-1" />
        </label>
      </div>
      <div className="flex gap-2">
        <button className="rounded border px-2 py-1 disabled:opacity-50" type="button" disabled={busy}
          onClick={() => void analyze()}>{busy ? "Medindo..." : "Analisar clipes da cena"}</button>
        {busy && <button className="underline" type="button" onClick={() => { cancelled.current = true; }}>Interromper</button>}
      </div>
      <p className="text-muted-foreground">{message || "Não destrutivo. Clipes 🔒 são ignorados. Requer upload ao host."}</p>
      {rows.length > 0 && (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {rows.map((row) => (
            <label key={row.trackId + row.elementId} className="flex gap-2 rounded border p-1">
              <input type="checkbox" checked={row.selected}
                onChange={(e) => setRows((old) => old.map((v) => v.elementId === row.elementId
                  ? { ...v, selected: e.target.checked } : v))} />
              <span className="min-w-0 flex-1 truncate" title={row.name}>
                {row.name}: {row.lufs.toFixed(1)} LUFS / {row.truePeak.toFixed(1)} dBTP
                → +{row.gainDb.toFixed(1)} dB {row.limitedByPeak ? "(limitado pelo pico)" : ""}
              </span>
            </label>
          ))}
        </div>
      )}
      {!!rows.length && <button type="button" onClick={apply} className="rounded border px-2 py-1">Aplicar ganho com Undo/Redo</button>}
      <p className="text-muted-foreground text-[11px]">A medição considera a mídia original; o ganho por clipe não substitui a medição do mix completo, do fade nem dos keyframes após a exportação.</p>
    </div>
  );
}

type MeasurementResult = {
  measurement: { inputI: number; inputTp: number };
  gainDb: number;
  expectedLufs: number;
  limitedByPeak: boolean;
};

async function measure(_sceneId: string, projectId: string, assetId: string,
  targetLufs: number, maxTruePeakDb: number): Promise<MeasurementResult> {
  const response = await lanRequest("loudness", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, assetId, targetLufs, maxTruePeakDb }),
  });
  return await response.json() as MeasurementResult;
}
