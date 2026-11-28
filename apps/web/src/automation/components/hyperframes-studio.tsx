"use client";

import { useMemo, useRef, useState } from "react";
import { planHyperFramesIntervals, formatTimelineDuration } from "@/hyperframes/intervals";
import { configuredRequest, type PublicConfiguration } from "./providers";
import { toast } from "sonner";
import { activityLog } from "@/diagnostics/activity-log";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { extractTimelineAudio } from "@/media/mediabunny";
import { decodeAudioToFloat32 } from "@/media/audio";
import { processMediaAssets } from "@/media/processing";
import { transcriptionService } from "@/services/transcription/service";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { getLanToken } from "@/lan-sync/client";
import { findAudioPeaks } from "@/automation/audio-peaks";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";

type Segment = { text: string; start: number; end: number };
type Draft = { html: string; css: string; summary?: string; provider?: string; model?: string };
type Stage = "idle" | "analyzing" | "designing" | "rendering";
type CompositionPart = Draft & { start: number; duration: number };

function isRecord(data: unknown): data is Record<string, unknown> {
  return !!data && typeof data === "object" && !Array.isArray(data);
}

function canvasResolution({ width, height }: { width: number; height: number }) {
  const scale = Math.min(1, 1280 / Math.max(width, height));
  return { width: Math.max(240, Math.round(width * scale / 2) * 2),
    height: Math.max(240, Math.round(height * scale / 2) * 2) };
}

function sandboxedPreview({ html, css, width, height }: {
  html: string; css: string; width: number; height: number;
}) {
  // An opaque-origin sandbox, no script permission, and no network access.
  // Do not insert AI-authored markup into the Editor's own DOM.
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:; font-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">
<style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden}
#root{position:relative;width:100%;height:100%;overflow:hidden}${css}</style>
</head><body><div id="root" data-composition-id="opencut-hyperframes"
data-width="${width}" data-height="${height}">${html}</div></body></html>`;
}

export function HyperFramesStudio() {
  const editor = useEditor();
  const { selectedElements } = useElementSelection();
  const [brief, setBrief] = useState("Crie uma composição visual que destaque as palavras importantes da narração");
  const [transcript, setTranscript] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [engine, setEngine] = useState<"parakeet" | "whisper">("parakeet");
  const [draft, setDraft] = useState<Draft>({
    html: '<div class="card"><div class="eyebrow">HYPERFRAMES</div><h1>Edição com IA</h1><p>Composição HTML/CSS editável</p></div>',
    css: '.card{position:absolute;inset:10%;padding:40px;border-radius:32px;background:linear-gradient(130deg,#172b47,#142015);color:#fff;font-family:Arial;display:flex;flex-direction:column;justify-content:center;box-shadow:0 20px 50px #0005}.eyebrow{font-size:16px;color:#fff2a6;letter-spacing:5px}h1{font-size:clamp(28px,6vw,72px);margin:15px 0}p{font-size:24px}',
  });
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [details, setDetails] = useState("");
  const [attempts, setAttempts] = useState<string[]>([]);
  const [allowTemplate, setAllowTemplate] = useState(true);
  const generation = useRef<AbortController | null>(null);
  const [parts, setParts] = useState<CompositionPart[]>([]);
  const [partIndex, setPartIndex] = useState(0);
  const [routing, setRouting] = useState<PublicConfiguration | null>(null);
  const totalSeconds = useEditor(e => mediaTimeToSeconds({time:e.timeline.getTotalDuration()}));
  const intervals = planHyperFramesIntervals(start, duration, totalSeconds);
  const effectiveDuration = intervals.reduce((sum,p)=>sum+p.duration,0);

  const project = editor.project.getActiveOrNull();
  const size = project?.settings.canvasSize ?? { width: 1920, height: 1080 };
  const resolution = canvasResolution(size);
  const srcdoc = useMemo(() => sandboxedPreview({
    html: draft.html, css: draft.css, width: resolution.width, height: resolution.height,
  }), [draft.html, draft.css, resolution.width, resolution.height]);

  const selectedSource = () => {
    if (selectedElements.length !== 1) return null;
    const selected = selectedElements[0];
    const found = editor.timeline.getElementsWithTracks({ elements: [selected] })[0];
    if (!found || found.element.type !== "video" || found.element.locked ||
        typeof found.element.params["hyperframes.html"] !== "string" ||
        typeof found.element.params["hyperframes.css"] !== "string") return null;
    return found;
  };

  const loadSelected = () => {
    const source = selectedSource();
    if (!source) return toast.info("Selecione um clipe HyperFrames desbloqueado na timeline.");
    setDraft({
      html: String(source.element.params["hyperframes.html"]),
      css: String(source.element.params["hyperframes.css"]),
    });
    setParts([]);
    setPartIndex(0);
    setDuration(mediaTimeToSeconds({ time: source.element.duration }));
    setStart(mediaTimeToSeconds({ time: source.element.startTime }));
    toast.success("Código HTML/CSS do clipe recuperado para edição.");
  };

  const analyzeAudio = async () => {
    if (stage !== "idle") return;
    setStage("analyzing"); setDetails("Analisando os quadros de energia da trilha...");
    try {
      const audioBlob = await extractTimelineAudio({
        tracks: editor.scenes.getActiveScene().tracks,
        mediaAssets: editor.media.getAssets(),
        totalDuration: editor.timeline.getTotalDuration(),
      });
      const { samples } = await decodeAudioToFloat32({ audioBlob, sampleRate: 16_000 });
      const nextPeaks = findAudioPeaks(samples, 16_000, 48).map(p => Number(p.seconds.toFixed(2)));
      setPeaks(nextPeaks);
      setDetails("Transcrevendo a fala localmente...");
      let parsed: unknown;
      if (engine === "parakeet") {
        const token = getLanToken();
        if (!token) throw Error("Configure a conexão LAN e inicie o serviço Parakeet, ou selecione Whisper no navegador.");
        const response = await fetch("/api/transcription/parakeet", {
          method: "POST", body: audioBlob,
          headers: { "Content-Type": "audio/wav", "x-lan-sync-token": token, "x-transcription-language": "pt" },
          signal: AbortSignal.timeout(610_000),
        });
        parsed = await response.json();
        if (!response.ok) {
          const message = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : "Parakeet indisponível.";
          throw Error(message);
        }
      } else {
        const audio = await decodeAudioToFloat32({ audioBlob, sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE });
        parsed = await transcriptionService.transcribe({ audioData: audio.samples, language: "pt" });
      }
      if (!isRecord(parsed) || !Array.isArray(parsed.segments)) throw Error("O motor não retornou segmentos com timestamps.");
      const nextSegments = parsed.segments.filter((s): s is Segment =>
        isRecord(s) && typeof s.text === "string" && typeof s.start === "number" &&
        typeof s.end === "number").slice(0, 6000);
      setSegments(nextSegments);
      setTranscript(nextSegments.map(s => s.text).join(" ").slice(0, 7000));
      setDetails(`${nextSegments.length} trechos de fala e ${nextPeaks.length} picos de áudio. Agora a IA pode considerar o sentido das palavras.`);
      toast.success("Análise de fala concluída; revise a transcrição antes de enviá-la à IA.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Análise de áudio indisponível.";
      setDetails(message); toast.error(message);
    } finally { setStage("idle"); }
  };

  const generate = async () => {
    if (stage !== "idle") return;
    if (!getLanToken()) return toast.error("Configure o token LAN para usar a IA do host.");
    if (brief.trim().length < 3) return toast.error("Escreva o que a composição deve transmitir.");
    if (!intervals.length) return toast.error("Escolha um intervalo válido dentro da timeline.");
    if (intervals.length > 1 && !window.confirm(`Gerar ${intervals.length} composições para ${formatTimelineDuration(effectiveDuration)}? Cada trecho pode consumir uma chamada de IA.`)) return;
    setStage("designing"); setDetails("Carregando configuração global de IA...");
    setAttempts([]); setParts([]); setPartIndex(0);
    const controller = new AbortController(); generation.current = controller;
    try {
      const scene = editor.scenes.getActiveScene().tracks;
      const timeline = [scene.main, ...scene.overlay, ...scene.audio].flatMap(track =>
        track.elements.map(element => ({
          type: element.type, name: element.name.slice(0, 75),
          start: Number(mediaTimeToSeconds({ time: element.startTime }).toFixed(2)),
          duration: Number(mediaTimeToSeconds({ time: element.duration }).toFixed(2)),
        })).slice(0, 40),
      );
      try { const config = await configuredRequest("GET"); setRouting(config); } catch { setAttempts(previous=>[...previous,"Não foi possível consultar a configuração. Tentando composição pelo roteador do host."]); }
      const next: CompositionPart[] = [];
      for (const [index, interval] of intervals.entries()) {
        setDetails(`Gerando trecho ${index+1}/${intervals.length} · ${formatTimelineDuration(interval.start)}...`);
        const relevant = segments.filter(s => s.end > interval.start && s.start < interval.start + interval.duration).slice(0,100);
        const contextualText = relevant.length ? relevant.map(s=>s.text).join(" ") : segments.length ? "" : transcript;
        const response = await fetch("/api/hyperframes/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-lan-sync-token": getLanToken() },
          body: JSON.stringify({ instruction: brief.trim(), transcript: contextualText.slice(0,4000),
            transcriptSegments: relevant.map(s=>({...s,text:s.text.slice(0,100)})),
            peaks: peaks.filter(p => p >= interval.start && p < interval.start + interval.duration).slice(0,32),
            timeline: timeline.filter(e => e.start < interval.start+interval.duration && e.start+e.duration > interval.start).slice(0,20),
            start: interval.start, duration: interval.duration, width: resolution.width, height: resolution.height, allowTemplate }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(260_000)]),
        });
        const result: unknown = await response.json().catch(() => null);
        if (isRecord(result) && Array.isArray(result.attempts)) {
          const rows = result.attempts.filter(isRecord).map(a => `Trecho ${index+1} · ${String(a.provider)} / ${String(a.model)} · ${a.status === "success" ? "OK" : String(a.reason || "falha")} (${Math.round(Number(a.elapsedMs || 0)/1000)}s)`);
          setAttempts(previous => [...previous, ...rows]);
          for (const row of rows) activityLog.record({source:"hyperframes", message:row});
        }
        if (!response.ok || !isRecord(result) || typeof result.html !== "string" || typeof result.css !== "string") {
          throw Error(`Trecho ${index+1}: ${isRecord(result) && typeof result.error === "string" ? result.error : `HTTP ${response.status}: IA não retornou composição válida.`}`);
        }
        next.push({ ...interval, html: result.html, css: result.css,
          summary: typeof result.summary === "string" ? result.summary : undefined,
          provider: typeof result.provider === "string" ? result.provider : undefined,
          model: typeof result.model === "string" ? result.model : undefined });
        setParts([...next]);
        if (index === 0) setDraft(next[0]);
        if (result.fallback === true) setAttempts(previous => [...previous, `Trecho ${index+1} · template local (sem IA)`]);
      }
      setParts(next); setPartIndex(0); setDraft(next[0]);
      setDetails(`${next.length} composições geradas. Revise os trechos antes de aplicar.`);
    } catch (error) {
      const message = controller.signal.aborted ? "Geração cancelada. Trechos concluídos preservados." : error instanceof Error ? error.message : "Falha na IA.";
      activityLog.record({source:"hyperframes", level:"error", message});
      setDetails(message); toast.error(message);
    } finally { generation.current = null; setStage("idle"); }
  };

  const renderToTimeline = async () => {
    if (stage !== "idle") return;
    if (!getLanToken()) return toast.error("Configure o token LAN.");
    if (!project) return toast.error("Abra um projeto primeiro.");
    if (!intervals.length) return toast.error("Escolha um intervalo válido dentro da timeline.");
    const existing = selectedSource();
    const planned: CompositionPart[] = parts.length ? parts.map((p,i)=>i===partIndex?{...p,...draft}:p) : intervals.map(interval=>({...draft,...interval}));
    if (parts.length && (planned.length > intervals.length || planned.some((p,i)=>!intervals[i] || Math.abs(p.start-intervals[i].start)>0.001 || Math.abs(p.duration-intervals[i].duration)>0.001))) return toast.error("O intervalo mudou. Gere novamente a composição antes de aplicar.");
    if (parts.length && parts.length < intervals.length && !window.confirm(`Aplicar apenas ${parts.length} de ${intervals.length} trechos concluídos?`)) return;
    setStage("rendering");
    try {
      const rendered: Array<{ part: CompositionPart; mediaId: string }> = [];
      for (const [index, part] of planned.entries()) {
        setDetails(`Renderizando ${index+1}/${planned.length} · ${formatTimelineDuration(part.start)}...`);
        const response = await fetch("/api/hyperframes/render", {
          method: "POST", headers: { "Content-Type": "application/json", "x-lan-sync-token": getLanToken() },
          body: JSON.stringify({ html: part.html, css: part.css, width: resolution.width, height: resolution.height, duration: part.duration, fps: 30 }),
          signal: AbortSignal.timeout(230_000),
        });
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          throw Error(`Trecho ${index+1}: ${isRecord(body) && typeof body.error === "string" ? body.error : "Renderizador indisponível."}`);
        }
        const blob = await response.blob();
        if (blob.size < 100) throw Error("O renderizador retornou um vídeo vazio.");
        const file = new File([blob], "HyperFrames-" + Date.now() + "-" + index + ".webm", { type: "video/webm" });
        const imported = await processMediaAssets({ files: [file] });
        if (!imported.length) throw Error("O editor não conseguiu decodificar o WebM renderizado.");
        const asset = await editor.media.addMediaAsset({ projectId: project.metadata.id, asset: imported[0] });
        if (!asset) throw Error("Falha ao salvar WebM no projeto.");
        rendered.push({part,mediaId:asset.id});
      }
      const trackId = existing && rendered.length === 1 ? existing.track.id : editor.timeline.addTrack({ type: "video", index: 0 });
      for (const {part,mediaId} of rendered) {
        const durationTicks = mediaTimeFromSeconds({ seconds: part.duration });
        const sourceParams = {
          "hyperframes.html": part.html, "hyperframes.css": part.css,
          "hyperframes.durationSeconds": part.duration, "hyperframes.summary": part.summary || "",
        };
        if (existing && existing.element.type === "video" && rendered.length === 1) {
          editor.timeline.updateElements({ updates: [{ trackId, elementId: existing.element.id,
            patch: { mediaId, duration: durationTicks, startTime: mediaTimeFromSeconds({seconds:part.start}), params: { ...existing.element.params, ...sourceParams } } }] });
        } else {
          const element = buildElementFromMedia({ mediaId, mediaType:"video", name:"HyperFrames · HTML/CSS",
            duration:durationTicks, startTime:mediaTimeFromSeconds({seconds:part.start}) });
          editor.timeline.insertElement({placement:{mode:"explicit",trackId},element:{...element,params:{...element.params,...sourceParams}}});
        }
      }
      setDetails(`${rendered.length} composições aplicadas à timeline.`); toast.success("HyperFrames aplicado.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao renderizar HTML/CSS.";
      setDetails(message); toast.error(message);
    } finally { setStage("idle"); }
  };

  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label="HyperFrames oficial HTML CSS">
      <div>
        <h3 className="text-sm font-semibold">HyperFrames oficial · HTML/CSS + IA</h3>
        <p className="text-muted-foreground text-xs">
          Gere composições com contexto da fala, edite o HTML/CSS, visualize em sandbox e renderize como camada WebM na timeline.
        </p>
      </div>
      <label className="block text-xs font-medium">Briefing visual
        <textarea value={brief} onChange={e=>setBrief(e.target.value)} maxLength={1200}
          className="bg-background mt-1 min-h-16 w-full rounded border p-2 text-xs" />
      </label>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label>Início na timeline (s)
          <input type="number" min={0} step={0.1} value={start} onChange={e=>setStart(Number(e.target.value))}
            className="bg-background mt-1 w-full rounded border p-1" />
        </label>
        <label>Duração máxima (s, 0 = até o fim)
          <input type="number" min={0} step={0.1} value={duration} onChange={e=>setDuration(Number(e.target.value))}
            className="bg-background mt-1 w-full rounded border p-1" />
        </label>
      </div>
      <p className="text-muted-foreground text-xs">Timeline: {formatTimelineDuration(totalSeconds)} · Intervalo: {formatTimelineDuration(effectiveDuration)} · {intervals.length} trecho(s) de renderização interna.</p>
      <button type="button" className="rounded border px-2 py-1 text-xs"
        onClick={loadSelected} disabled={stage !== "idle"}>Carregar HTML/CSS do clipe selecionado</button>
      <div className="rounded border p-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label>Transcrição
            <select value={engine} onChange={e=>setEngine(e.target.value as "parakeet" | "whisper")}
              className="bg-background ml-2 rounded border p-1">
              <option value="parakeet">Parakeet CPU (LAN)</option>
              <option value="whisper">Whisper (navegador)</option>
            </select>
          </label>
          <button type="button" className="rounded border px-2 py-1 disabled:opacity-50"
            disabled={stage !== "idle"} onClick={() => void analyzeAudio()}>
            {stage === "analyzing" ? "Transcrevendo…" : "Analisar fala e música da timeline"}
          </button>
        </div>
        <textarea aria-label="Transcrição semântica editável" value={transcript}
          onChange={e=>{setTranscript(e.target.value);setSegments([]);}} maxLength={7000}
          placeholder="Transcrição editável. Você também pode colar o roteiro aqui."
          className="bg-background w-full min-h-20 rounded border p-2 text-xs" />
        <p className="text-muted-foreground text-[11px]">
          {segments.length} segmentos com timestamps · {peaks.length} picos.
          A fala é transcrita localmente; ao clicar em Gerar com IA, o texto pode ser enviado ao provedor configurado. Não envia o áudio original à IA externa.
        </p>
      </div>
      <p className="text-muted-foreground text-xs">IA principal: {routing?.preferred || "definida em Conexões"} · fallback conforme prioridades de Provedores. Não é necessário selecionar novamente.</p>

      <label className="flex gap-2 text-xs"><input type="checkbox" checked={allowTemplate} disabled={stage !== "idle"} onChange={e=>setAllowTemplate(e.target.checked)} /> Usar template local se todas as IAs falharem (identificado no resultado)</label>
      <button type="button" className="w-full rounded border px-3 py-2 text-xs font-medium disabled:opacity-50"
        disabled={stage !== "idle"} onClick={() => void generate()}>
        {stage === "designing" ? "Criando composição…" : "Gerar HTML/CSS com IA e contexto do áudio"}
      </button>
      {stage === "designing" && <button type="button" className="rounded border px-2 py-1 text-xs" onClick={()=>generation.current?.abort()}>Cancelar geração</button>}
      {!!details && <p role="status" className="break-words text-xs">{details}</p>}
      {attempts.length > 0 && <details open className="rounded border p-2 text-xs"><summary>Tentativas dos provedores ({attempts.length})</summary><div className="max-h-48 overflow-auto">{attempts.map((item,i)=><p key={i} className="break-words py-1">{item}</p>)}</div></details>}
      {parts.length > 1 && <label className="block text-xs">Revisar trecho
        <select className="bg-background w-full rounded border p-1" disabled={stage!=="idle"} value={partIndex} onChange={e=>{const index=Number(e.target.value);setParts(prev=>prev.map((p,i)=>i===partIndex?{...p,...draft}:p));setPartIndex(index);setDraft(parts[index]);}}>
          {parts.map((p,i)=><option key={i} value={i}>{i+1} · {formatTimelineDuration(p.start)}–{formatTimelineDuration(p.start+p.duration)}</option>)}
        </select>
      </label>}
      {draft.summary && <p className="text-xs">{draft.summary} ({draft.provider || "IA"} / {draft.model || "modelo"})</p>}
      <div className="rounded border bg-[repeating-conic-gradient(#555_0%_25%,#777_0%_50%)_0_0/20px_20px] overflow-hidden"
        style={{ aspectRatio: `${resolution.width} / ${resolution.height}` }}>
        <iframe title="Prévia segura HyperFrames" sandbox="" srcDoc={srcdoc}
          className="size-full border-0" referrerPolicy="no-referrer" />
      </div>
      <div className="grid gap-2">
        <label className="block text-xs font-medium">HTML editável
          <textarea aria-label="Código HTML HyperFrames" spellCheck={false}
            value={draft.html} maxLength={26000}
            onChange={e=>setDraft(p=>({...p,html:e.target.value}))}
            className="bg-background mt-1 min-h-28 w-full rounded border p-2 font-mono text-[11px]" />
        </label>
        <label className="block text-xs font-medium">CSS editável
          <textarea aria-label="Código CSS HyperFrames" spellCheck={false}
            value={draft.css} maxLength={26000}
            onChange={e=>setDraft(p=>({...p,css:e.target.value}))}
            className="bg-background mt-1 min-h-28 w-full rounded border p-2 font-mono text-[11px]" />
        </label>
      </div>
      <p className="text-muted-foreground text-[11px]">
        Segurança: HTML/CSS sem JavaScript, URLs externas, fontes remotas ou iframes. A renderização é nativa do Editor: a CLI HyperFrames vem instalada na imagem web.
        WebM com transparência funciona principalmente em navegadores Chromium; confirme a preservação do alfa na exportação.
      </p>
      <button type="button" disabled={stage !== "idle" || !draft.html.trim()}
        onClick={() => void renderToTimeline()}
        className="w-full rounded border px-3 py-2 text-xs font-medium disabled:opacity-50">
        {stage === "rendering" ? "Processando a composição no Editor…" : "Aplicar composição à timeline (renderização automática)"}
      </button>
}
    </section>
  );
}
