"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
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
const MAX_DURATION = 12;

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
  const [duration, setDuration] = useState(5);
  const [start, setStart] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [details, setDetails] = useState("");
  const [provider, setProvider] = useState("auto");

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
          headers: { "Content-Type": "audio/wav", "x-lan-sync-token": token },
          signal: AbortSignal.timeout(245_000),
        });
        parsed = await response.json();
        if (!response.ok) {
          const message = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : "Parakeet indisponível.";
          throw Error(message);
        }
      } else {
        const audio = await decodeAudioToFloat32({ audioBlob, sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE });
        parsed = await transcriptionService.transcribe({ audioData: audio.samples, language: "auto" });
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
    setStage("designing"); setDetails("Enviando briefing, transcrição e contexto da timeline ao modelo selecionado...");
    try {
      const scene = editor.scenes.getActiveScene().tracks;
      const timeline = [scene.main, ...scene.overlay, ...scene.audio].flatMap(track =>
        track.elements.map(element => ({
          type: element.type, name: element.name.slice(0, 75),
          start: Number(mediaTimeToSeconds({ time: element.startTime }).toFixed(2)),
          duration: Number(mediaTimeToSeconds({ time: element.duration }).toFixed(2)),
        })).slice(0, 40),
      );
      const response = await fetch("/api/hyperframes/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-lan-sync-token": getLanToken() },
        body: JSON.stringify({ instruction: brief.trim(), transcript: transcript.slice(0, 7000),
          transcriptSegments: segments.filter(s => s.end >= start && s.start < start + duration).slice(0, 100),
          peaks: peaks.filter(p => p >= start && p < start + duration),
          timeline, duration, width: resolution.width, height: resolution.height,
          ...(provider !== "auto" ? { provider } : {}) }),
        signal: AbortSignal.timeout(70_000),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(responseBody) || typeof responseBody.html !== "string" ||
          typeof responseBody.css !== "string") {
        throw Error(isRecord(responseBody) && typeof responseBody.error === "string" ?
          responseBody.error : "A IA não retornou uma composição válida.");
      }
      setDraft({ html: responseBody.html, css: responseBody.css,
        summary: typeof responseBody.summary === "string" ? responseBody.summary : undefined,
        provider: typeof responseBody.provider === "string" ? responseBody.provider : undefined,
        model: typeof responseBody.model === "string" ? responseBody.model : undefined });
      setDetails("Composição HTML/CSS criada. Revise a prévia e o código antes de renderizar.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na IA.";
      setDetails(message); toast.error(message);
    } finally { setStage("idle"); }
  };

  const renderToTimeline = async () => {
    if (stage !== "idle") return;
    if (!getLanToken()) return toast.error("Configure o token LAN.");
    if (!project) return toast.error("Abra um projeto primeiro.");
    if (!(duration >= 0.3 && duration <= MAX_DURATION)) return toast.error("Duração deve ser entre 0,3 e 12 segundos.");
    const existing = selectedSource();
    setStage("rendering"); setDetails("Renderizando HTML/CSS no HyperFrames oficial, quadro a quadro...");
    try {
      const response = await fetch("/api/hyperframes/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-lan-sync-token": getLanToken() },
        body: JSON.stringify({
          html: draft.html, css: draft.css,
          width: resolution.width, height: resolution.height, duration, fps: 30,
        }),
        signal: AbortSignal.timeout(230_000),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw Error(isRecord(body) && typeof body.error === "string" ? body.error : "Renderizador indisponível.");
      }
      const blob = await response.blob();
      if (blob.size < 100) throw Error("O renderizador retornou um vídeo vazio.");
      const file = new File([blob], "HyperFrames-" + Date.now() + ".webm", { type: "video/webm" });
      const imported = await processMediaAssets({ files: [file] });
      if (!imported.length) throw Error("O editor não conseguiu decodificar o WebM renderizado.");
      const asset = await editor.media.addMediaAsset({
        projectId: project.metadata.id, asset: imported[0],
      });
      if (!asset) throw Error("Falha ao salvar WebM no projeto.");

      const durationTicks = mediaTimeFromSeconds({ seconds: duration });
      const sourceParams = {
        "hyperframes.html": draft.html,
        "hyperframes.css": draft.css,
        "hyperframes.durationSeconds": duration,
        "hyperframes.summary": draft.summary || "",
      };
      if (existing && existing.element.type === "video") {
        editor.timeline.updateElements({ updates: [{
          trackId: existing.track.id, elementId: existing.element.id,
          patch: { mediaId: asset.id, duration: durationTicks,
            params: { ...existing.element.params, ...sourceParams } },
        }] });
        toast.success("Clipe HyperFrames atualizado. O código-fonte permanece no projeto.");
      } else {
        const trackId = editor.timeline.addTrack({ type: "video", index: 0 });
        const element = buildElementFromMedia({
          mediaId: asset.id, mediaType: "video", name: "HyperFrames · HTML/CSS",
          duration: durationTicks, startTime: mediaTimeFromSeconds({ seconds: Math.max(0, start) }),
        });
        editor.timeline.insertElement({ placement: { mode: "explicit", trackId },
          element: { ...element, params: { ...element.params, ...sourceParams } } });
        toast.success("Overlay HyperFrames inserido na timeline. É possível editá-lo e renderizar de novo.");
      }
      setDetails("WebM renderizado e salvo. Abra o clipe na timeline para reproduzir ou exportar com o vídeo.");
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
        <label>Duração (s, máximo 12)
          <input type="number" min={0.3} max={12} step={0.1} value={duration} onChange={e=>setDuration(Number(e.target.value))}
            className="bg-background mt-1 w-full rounded border p-1" />
        </label>
      </div>
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
          onChange={e=>setTranscript(e.target.value)} maxLength={7000}
          placeholder="Transcrição editável. Você também pode colar o roteiro aqui."
          className="bg-background w-full min-h-20 rounded border p-2 text-xs" />
        <p className="text-muted-foreground text-[11px]">
          {segments.length} segmentos com timestamps · {peaks.length} picos.
          A fala é transcrita localmente; ao clicar em Gerar com IA, o texto pode ser enviado ao provedor configurado. Não envia o áudio original à IA externa.
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs">Provedor
        <select aria-label="Provedor de IA HyperFrames" className="bg-background rounded border p-1"
          value={provider} onChange={e=>setProvider(e.target.value)}>
          <option value="auto">Automático (fallback)</option>
          <option value="ollama">Ollama local</option>
          <option value="nvidia">NVIDIA</option>
          <option value="openai">OpenAI</option>
          <option value="moonshot">Kimi / Moonshot</option>
          <option value="deepseek">DeepSeek</option>
          <option value="anthropic">Claude</option>
        </select>
      </label>
      <button type="button" className="w-full rounded border px-3 py-2 text-xs font-medium disabled:opacity-50"
        disabled={stage !== "idle"} onClick={() => void generate()}>
        {stage === "designing" ? "Criando composição…" : "Gerar HTML/CSS com IA e contexto do áudio"}
      </button>
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
      {!!details && <p role="status" className="text-xs">{details}</p>}
    </section>
  );
}
