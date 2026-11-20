"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { buildTextElement } from "@/timeline/element-utils";
import { extractTimelineAudio } from "@/media/mediabunny";
import { decodeAudioToFloat32 } from "@/media/audio";
import { mediaTimeFromSeconds } from "@/wasm";

type Beat = { seconds: number; energy: number };

/** Produce deterministic edit points from audio, without executing generated JavaScript. */
export function findAudioPeaks(samples: Float32Array, sampleRate: number, maxBeats = 16): Beat[] {
  if (!(sampleRate > 0)) return [];
  const frameSamples = Math.max(1, Math.floor(sampleRate * 0.15));
  const frames: Beat[] = [];
  for (let offset = 0; offset < samples.length; offset += frameSamples) {
    let total = 0;
    const count = Math.min(frameSamples, samples.length - offset);
    for (let i = 0; i < count; i++) total += samples[offset + i] ** 2;
    frames.push({ seconds: offset / sampleRate, energy: Math.sqrt(total / count) });
  }
  if (!frames.length) return [];
  const sorted = frames.map(f => f.energy).sort((a, b) => a - b);
  const threshold = Math.max(0.08, sorted[Math.floor(sorted.length * 0.8)] * 1.2);
  const peaks: Beat[] = [];
  for (let i = 1; i < frames.length - 1; i++) {
    if (frames[i].energy < threshold || frames[i].energy < frames[i - 1].energy ||
        frames[i].energy <= frames[i + 1].energy) continue;
    if (peaks.length && frames[i].seconds - peaks[peaks.length - 1].seconds < 0.5) continue;
    peaks.push(frames[i]);
    if (peaks.length >= maxBeats) break;
  }
  return peaks;
}

export function HyperFramesPanel() {
  const editor = useEditor();
  const [title, setTitle] = useState("SEU TÍTULO");
  const [seconds, setSeconds] = useState(3);
  const [mode, setMode] = useState<"static" | "beats">("static");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [busy, setBusy] = useState(false);
  const [points, setPoints] = useState<number[]>([]);
  const [error, setError] = useState("");

  const analyze = async () => {
    setBusy(true); setError(""); setPoints([]);
    try {
      const audioBlob = await extractTimelineAudio({
        tracks: editor.scenes.getActiveScene().tracks,
        mediaAssets: editor.media.getAssets(),
        totalDuration: editor.timeline.getTotalDuration(),
      });
      const { samples } = await decodeAudioToFloat32({ audioBlob, sampleRate: 16_000 });
      const beats = findAudioPeaks(samples, 16_000, 16);
      setPoints(beats.map((b) => b.seconds));
      if (!beats.length) setError("Nenhuma batida forte detectada. Use o modo manual.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler a trilha de áudio");
    } finally { setBusy(false); }
  };

  const insert = () => {
    if (!title.trim() || !(seconds > 0) || seconds > 60) return;
    const stamps = mode === "beats" ? points : [editor.playback.getCurrentTime() / 1_000_000];
    if (!stamps.length) return toast.error("Analise o áudio antes de inserir uma composição.");
    for (const time of stamps) {
      const element = buildTextElement({
        startTime: mediaTimeFromSeconds({ seconds: Math.max(0, time) }),
        raw: { name: "HyperFrames · " + title.slice(0, 32), params: { content: title.trim() },
          duration: mediaTimeFromSeconds({ seconds }) },
      });
      editor.timeline.insertElement({ element, placement: { mode: "auto" } });
    }
    toast.success(`${stamps.length} composição(ões) de texto inserida(s) na timeline. O render usa o mecanismo de texto existente.`);
  };

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <h3 className="text-sm font-medium">HyperFrames · composição declarativa (experimental)</h3>
      <p className="text-muted-foreground text-xs">Crie overlays de texto temporizados e sincronizados com picos de áudio. Não executa HTML/JS de terceiros. Templates HTML/CSS e IA de composição ainda não estão integrados.</p>
      <input aria-label="Texto da composição" value={title} maxLength={120}
        onChange={(e) => setTitle(e.target.value)} placeholder="Título da animação"
        className="bg-background w-full rounded border px-2 py-1 text-xs" />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Duração (s)
          <input type="number" min={0.3} max={60} step={0.5} value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            className="bg-background w-full rounded border px-2 py-1" />
        </label>
        <label className="text-xs">Orientação do projeto
          <select aria-label="Orientação de HyperFrames" value={orientation}
            onChange={(e) => setOrientation(e.target.value === "vertical" ? "vertical" : "horizontal")}
            className="bg-background w-full rounded border px-2 py-1">
            <option value="horizontal">16:9</option><option value="vertical">9:16</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs">Sincronização
        <select value={mode} aria-label="Sincronização da composição"
          onChange={(e) => setMode(e.target.value === "beats" ? "beats" : "static")}
          className="bg-background rounded border px-2 py-1">
          <option value="static">No playhead</option>
          <option value="beats">Batidas detectadas no áudio</option>
        </select>
      </label>
      {mode === "beats" && (
        <button type="button" className="rounded border px-2 py-1 text-xs" disabled={busy}
          onClick={() => void analyze()}>{busy ? "Analisando áudio..." : "Analisar batidas da timeline"}</button>
      )}
      {!!points.length && <p className="text-xs">{points.length} picos detectados para inserção.</p>}
      {error && <p className="text-amber-500 text-xs">{error}</p>}
      <div className="rounded border p-3 text-center" style={{ aspectRatio: orientation === "vertical" ? "9 / 16" : "16 / 9" }}>
        <div className="flex h-full items-center justify-center text-center text-lg font-bold">{title}</div>
      </div>
      <button type="button" className="rounded border px-2 py-1 text-xs" disabled={busy || !title.trim()}
        onClick={insert}>Inserir composição editável na timeline</button>
    </section>
  );
}
