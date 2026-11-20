import { authorizeSync } from "@/lan-sync/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SERVICE_URL = "http://parakeet:8707";
const MAX_BYTES = 128 * 1024 * 1024;
const WAIT_MS = 240_000;

function internalConfig() {
  const token = process.env.PARAKEET_INTERNAL_TOKEN || "";
  const candidate = process.env.PARAKEET_SERVICE_URL || SERVICE_URL;
  // Never allow end users to choose an internal service URL.
  if (!candidate.startsWith("http://parakeet:8707") &&
      !candidate.startsWith("http://127.0.0.1:8707")) return null;
  return token.length >= 16 ? { token, base: candidate.replace(/\/$/, "") } : null;
}

function authorized(request: Request): Response | null {
  // Require the same host token as other CPU-intensive LAN media endpoints.
  return authorizeSync(request);
}

export async function GET(request: Request) {
  const denied = authorized(request);
  if (denied) return denied;
  const config = internalConfig();
  if (!config) return Response.json({ available: false, configured: false });
  try {
    const response = await fetch(config.base + "/health", { signal: AbortSignal.timeout(4_000), cache: "no-store" });
    return Response.json({ available: response.ok, configured: true, engine: "moondream/parakeet-redux", device: "cpu" });
  } catch {
    return Response.json({ available: false, configured: true, engine: "moondream/parakeet-redux", device: "cpu" });
  }
}

export async function POST(request: Request) {
  const denied = authorized(request);
  if (denied) return denied;
  const config = internalConfig();
  if (!config) return Response.json({ error: "Serviço Parakeet não configurado no host." }, { status: 503 });
  const len = Number(request.headers.get("content-length") || "0");
  if (!Number.isSafeInteger(len) || len <= 0 || len > MAX_BYTES) {
    return Response.json({ error: "O áudio precisa ter entre 1 byte e 128 MiB." }, { status: 413 });
  }
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength !== len) return Response.json({ error: "Áudio incompleto." }, { status: 400 });
    const response = await fetch(config.base + "/transcribe", {
      method: "POST",
      headers: { "Content-Type": "audio/wav", "x-parakeet-token": config.token },
      body: bytes, signal: AbortSignal.timeout(WAIT_MS),
    });
    if (!response.ok) {
      return Response.json({ error: "O motor Parakeet não concluiu o processamento. Verifique os logs do serviço." }, { status: 502 });
    }
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== "object") throw new Error("Resposta inválida");
    const data = raw as Record<string, unknown>;
    if (!Array.isArray(data.segments)) throw new Error("Segmentos inválidos");
    const segments = data.segments.slice(0, 40_000).flatMap((segment) => {
      if (!segment || typeof segment !== "object") return [];
      const item = segment as Record<string, unknown>;
      if (typeof item.text !== "string" || typeof item.start !== "number" || typeof item.end !== "number" ||
          !Number.isFinite(item.start) || !Number.isFinite(item.end) ||
          Number(item.start) < 0 || Number(item.end) < Number(item.start)) return [];
      return [{ text: item.text, start: Number(item.start), end: Number(item.end) }];
    });
    return Response.json({ text: typeof data.text === "string" ? data.text : segments.map(s=>s.text).join(" "),
      segments, language: typeof data.language === "string" ? data.language : "auto",
      engine: "moondream/parakeet-redux", device: "cpu" });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.name === "TimeoutError" ?
      "Tempo limite do Parakeet excedido." : "Não foi possível concluir a transcrição local." }, { status: 502 });
  }
}
