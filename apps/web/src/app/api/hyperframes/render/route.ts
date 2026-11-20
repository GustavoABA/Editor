import { authorizeSync } from "@/lan-sync/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST = "http://hyperframes-render:8712";
function worker() {
  const token = process.env.HYPERFRAMES_INTERNAL_TOKEN || "";
  // The worker never accepts a caller-supplied host or URL (SSRF guard).
  const config = process.env.HYPERFRAMES_SERVICE_URL || HOST;
  if (config !== HOST && config !== "http://127.0.0.1:8712")
    return null;
  return token.length >= 16 ? { url: config, token } : null;
}

export async function GET(request: Request) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  const config = worker();
  if (!config) return Response.json({ available: false, reason: "Configure HYPERFRAMES_INTERNAL_TOKEN." });
  try {
    const response = await fetch(config.url + "/health", {
      headers: { "x-hyperframes-token": config.token },
      signal: AbortSignal.timeout(4_000), cache: "no-store",
    });
    return Response.json({ available: response.ok, engine: "official-hyperframes-cli",
      format: "webm", transparent: true });
  } catch {
    return Response.json({ available: false, engine: "official-hyperframes-cli" });
  }
}

export async function POST(request: Request) {
  const denied = authorizeSync(request);
  if (denied) return denied;
  const config = worker();
  if (!config) return Response.json({ error: "Renderizador HyperFrames não configurado." }, { status: 503 });
  const len = Number(request.headers.get("content-length") || "0");
  if (!Number.isSafeInteger(len) || len < 1 || len > 96_000)
    return Response.json({ error: "HTML/CSS muito grande (máximo de 96 KB)." }, { status: 413 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 96_000) return Response.json({ error: "Payload muito grande." }, { status: 413 });
    const response = await fetch(config.url + "/render", {
      method: "POST", headers: {
        "Content-Type": "application/json",
        "x-hyperframes-token": config.token,
      }, body: raw, signal: AbortSignal.timeout(225_000), cache: "no-store",
    });
    if (!response.ok) {
      const err: unknown = await response.json().catch(() => null);
      return Response.json({ error: err && typeof err === "object" && "error" in err &&
        typeof err.error === "string" ? err.error : "Falha no renderizador HyperFrames." },
        { status: response.status === 429 ? 429 : 502 });
    }
    if (!response.body) return Response.json({ error: "Renderizador retornou mídia vazia." }, { status: 502 });
    // Stream the rendered overlay directly back to the browser. Do not persist
    // untrusted composition code or intermediate files in the web container.
    return new Response(response.body, {
      headers: { "Content-Type": "video/webm", "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="hyperframes-overlay.webm"' },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error && err.name === "TimeoutError"
      ? "HyperFrames excedeu o tempo limite." : "HyperFrames indisponível. Ative o perfil Docker hyperframes." },
      { status: 502 });
  }
}
