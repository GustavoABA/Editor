type FallbackComposition = {
  html: string;
  css: string;
  summary: string;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function paletteFor(instruction: string): { primary: string; secondary: string; accent: string; background: string } {
  const text = instruction.toLowerCase();
  if (text.includes("roxa") || text.includes("roxo") || text.includes("purple")) {
    return { primary: "#8b5cf6", secondary: "#2563eb", accent: "#ffffff", background: "#09090b" };
  }
  if (text.includes("verde") || text.includes("green")) {
    return { primary: "#22c55e", secondary: "#0ea5e9", accent: "#f8fafc", background: "#071a12" };
  }
  if (text.includes("vermelh") || text.includes("red")) {
    return { primary: "#f43f5e", secondary: "#f97316", accent: "#fff7ed", background: "#1c0710" };
  }
  return { primary: "#2563eb", secondary: "#22d3ee", accent: "#f8fafc", background: "#07111f" };
}

/**
 * Last-resort local composition: it is deterministic, fast on phones and
 * never needs a network model. The embedded model normally produces a richer
 * result before this path is used.
 */
export function createLocalHyperFramesFallback({
  instruction,
  transcript,
}: {
  instruction: string;
  transcript: string;
}): FallbackComposition {
  const palette = paletteFor(instruction);
  const source = transcript.trim() || instruction.trim();
  const headline = escapeHtml(source.replace(/\s+/g, " ").slice(0, 88) || "Sua história em movimento");
  const label = escapeHtml(instruction.replace(/\s+/g, " ").slice(0, 54) || "HYPERFRAMES");
  return {
    html: `<div class="hf-bg"></div><section class="hf-card"><p class="hf-label">${label}</p><h1>${headline}</h1><div class="hf-line"></div><p class="hf-caption">Sincronizado com a energia do áudio</p></section>`,
    css: `@keyframes hf-enter{0%{opacity:0;transform:translateY(38px) scale(.96)}65%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:1;transform:translateY(0)}}@keyframes hf-orb{0%,100%{transform:translate3d(-8%,-6%,0) scale(1)}50%{transform:translate3d(10%,8%,0) scale(1.18)}}.hf-bg{position:absolute;inset:-15%;background:radial-gradient(circle at 22% 20%,${palette.primary},transparent 37%),radial-gradient(circle at 78% 76%,${palette.secondary},transparent 42%),${palette.background};animation:hf-orb 4s ease-in-out infinite}.hf-card{position:absolute;left:8%;right:8%;bottom:11%;padding:7%;border:1px solid color-mix(in srgb,${palette.accent} 42%,transparent);border-radius:28px;background:#0008;backdrop-filter:blur(10px);color:${palette.accent};animation:hf-enter .7s cubic-bezier(.2,.8,.2,1) both}.hf-label{margin:0 0 12px;font:700 14px Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:${palette.secondary}}h1{margin:0;font:800 clamp(30px,6vw,74px)/1.04 Arial,sans-serif;letter-spacing:-.045em}.hf-line{width:34%;height:5px;margin:22px 0 14px;border-radius:9px;background:${palette.primary}}.hf-caption{margin:0;font:500 clamp(13px,2vw,22px)/1.35 Arial,sans-serif;opacity:.82}`,
    summary: "Fallback local por template: composição criada sem API externa, Ollama ou download em tempo de execução.",
  };
}
