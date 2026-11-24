import { authorizeSync } from "@/lan-sync/server";
import { createRoutedPlan } from "@/ai/plan-router";
import { createLocalHyperFramesFallback } from "@/hyperframes/local-fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecordShape = Record<string, unknown>;
function object(value: unknown): value is RecordShape {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const format = {
  type: "object",
  properties: {
    summary: { type: "string" },
    commands: { type: "array", maxItems: 1, items: {
      type: "object", properties: {
        type: { type: "string", enum: ["html_css"] },
        payload: { type: "object", properties: {
          html: { type: "string" }, css: { type: "string" },
        }, required: ["html", "css"] },
      }, required: ["type", "payload"],
    } },
  }, required: ["summary", "commands"],
} as const;

export async function POST(request: Request) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  const length = Number(request.headers.get("content-length") || "0");
  if (!Number.isSafeInteger(length) || length < 1 || length > 22_000)
    return Response.json({ error: "Pedido acima do limite de 22 KB." }, { status: 413 });
  const raw: unknown = await request.json().catch(() => null);
  if (!object(raw) || typeof raw.instruction !== "string" ||
    raw.instruction.trim().length < 3 || raw.instruction.length > 1200 ||
    typeof raw.transcript !== "string" || raw.transcript.length > 7000)
    return Response.json({ error: "Pedido de composição inválido." }, { status: 400 });
  const timeline = Array.isArray(raw.timeline) ? raw.timeline.slice(0, 40).filter((v): v is RecordShape =>
    object(v) && typeof v.name === "string" && typeof v.start === "number" &&
    typeof v.duration === "number").map(v => ({
      name: String(v.name).slice(0, 75), start: v.start, duration: v.duration,
      type: String(v.type || "").slice(0, 24),
    })) : [];
  const timestamps = Array.isArray(raw.transcriptSegments) ? raw.transcriptSegments.slice(0, 120)
    .filter((v): v is RecordShape => object(v) && typeof v.text === "string" &&
      typeof v.start === "number" && typeof v.end === "number")
    .map(v => ({ text: String(v.text).slice(0, 120), start: v.start, end: v.end })) : [];
  const peaks = Array.isArray(raw.peaks) ? raw.peaks.filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 3600,
  ).slice(0, 32) : [];
  const duration = typeof raw.duration === "number" &&
    Number.isFinite(raw.duration) ? Math.min(12, Math.max(0.3, raw.duration)) : 5;
  const description = JSON.stringify({
    brief: raw.instruction, transcript: raw.transcript, timestamps,
    energyPeaks: peaks, timeline, durationSeconds: duration,
    width: raw.width, height: raw.height,
  }).slice(0, 14500);
  try {
    const ai = await createRoutedPlan({
      preferred: raw.provider,
      maxTokens: 4096,
      format,
      messages: [{
        role: "system",
        content: `Você é o diretor de arte HyperFrames (framework oficial HTML->vídeo).
Analise semanticamente a transcrição e timestamps fornecidos: tema, emoções,
palavras-chave, números, ações, mudança de assunto, além dos picos de energia.
Projete um único overlay visual com duração limitada que faça sentido com a fala
durante o intervalo solicitado. Crie COMPOSIÇÃO LIVRE usando HTML de elementos
de layout (div, span, h1,h2,p,section,article,header,footer,strong,em,small,ul,li)
e CSS autoral. Pode criar cards, infográficos tipográficos, banners, notícias,
calendários visuais, gráficos feitos com barras CSS, títulos animados com
@keyframes e transições visuais. Faça um resultado visualmente rico e
legível, com respeito à proporção vertical/horizontal informada.
Saída APENAS JSON {summary,commands:[{type:"html_css",payload:{html:"...",css:"..."}}]}.
Forneça HTML fragmento puro, sem tags html/head/body/style. CSS separado.
Proibidos JavaScript, <script>, SVG, iframe, URLs, @import, url(...), fontes
remotas, imagens externas e qualquer código executável. Somente HTML/CSS
autocontidos. O renderizador encapsula seu código numa faixa temporizada
da timeline; não crie data-composition-id. Seja conciso, código menor que
15 KB e sem depender de JS.
Nunca invente fatos fora da transcrição; caso não haja fala, use o briefing
e o ritmo musical sem afirmar que houve compreensão de conteúdo verbal.`,
      }, {
        role: "user", content: description,
      }],
    });
    const parsed: unknown = JSON.parse(ai.content);
    if (!object(parsed) || !Array.isArray(parsed.commands)) throw Error("IA sem comandos.");
    const cmd = parsed.commands.find(v => object(v) && v.type === "html_css");
    if (!object(cmd) || !object(cmd.payload)) throw Error("IA não gerou HTML/CSS.");
    const html = cmd.payload.html, css = cmd.payload.css;
    if (typeof html !== "string" || !html.trim() || html.length > 26_000 ||
        typeof css !== "string" || css.length > 26_000)
      throw Error("Composição vazia ou acima do limite.");
    return Response.json({
      html, css, provider: ai.provider, model: ai.model,
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 900) : "",
    });
  } catch (error) {
    const fallback = createLocalHyperFramesFallback({
      instruction: raw.instruction,
      transcript: raw.transcript,
    });
    return Response.json({
      html: fallback.html,
      css: fallback.css,
      provider: "local-template",
      model: "embedded-deterministic-fallback",
      summary: fallback.summary,
      degradedFrom: error instanceof Error ? error.message.slice(0, 180) : "AI providers unavailable",
    });
  }
}
