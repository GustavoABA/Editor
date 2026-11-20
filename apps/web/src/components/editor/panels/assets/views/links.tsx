"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|mp4|webm|mov|mp3|ogg|wav|m4a)$/i;

type ResolvedLink = { kind: "youtube" | "twitch" | "direct" | "external"; url: string; embed?: string };

export function resolveMediaLink(value: string, parentHost?: string): ResolvedLink {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("Use apenas links HTTPS.");
  if (parsed.username || parsed.password) throw new Error("URLs com credenciais são bloqueadas.");
  const host = parsed.hostname.toLowerCase();
  const parent = (parentHost || "localhost").replace(/[^a-z0-9.-]/gi, "");
  if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    const id = host === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).at(-1) || "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("URL do vídeo do YouTube inválida.");
    return { kind: "youtube", url: parsed.toString(), embed: "https://www.youtube-nocookie.com/embed/" + id };
  }
  if (host === "twitch.tv" || host === "www.twitch.tv" || host === "m.twitch.tv") {
    const paths = parsed.pathname.split("/").filter(Boolean);
    const channel = paths[0] || "";
    if (!/^[A-Za-z0-9_]{3,25}$/.test(channel)) throw new Error("Canal da Twitch inválido.");
    if (paths.length >= 3 && paths[1] === "clip" && /^[A-Za-z0-9_-]+$/.test(paths[2])) {
      return { kind: "twitch", url: parsed.toString(), embed: "https://clips.twitch.tv/embed?clip=" + encodeURIComponent(paths[2]) + "&parent=" + encodeURIComponent(parent) };
    }
    return { kind: "twitch", url: parsed.toString(), embed: "https://player.twitch.tv/?channel=" + encodeURIComponent(channel) + "&parent=" + encodeURIComponent(parent) + "&muted=true" };
  }
  if (MEDIA_EXT.test(parsed.pathname) && !["localhost", "127.0.0.1", "::1"].includes(host)) {
    return { kind: "direct", url: parsed.toString() };
  }
  return { kind: "external", url: parsed.toString() };
}

async function fetchAuthorizedMedia(url: string): Promise<File> {
  // Fetch happens in the user's browser, not on the server, to avoid server-side
  // requests to arbitrary external or private endpoints (SSRF).
  const response = await fetch(url, {
    mode: "cors", credentials: "omit", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) throw new Error("O servidor bloqueou o download ou o CORS.");
  const declaredSize = Number(response.headers.get("content-length") || "0");
  if (declaredSize > MAX_FILE_BYTES) throw new Error("Arquivo acima de 200 MB.");
  const parts: ArrayBuffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES) throw new Error("Arquivo acima de 200 MB.");
      // Copy into an owned ArrayBuffer; BlobPart does not accept SharedArrayBuffer-like buffers.
      const safeChunk = new Uint8Array(value.byteLength);
      safeChunk.set(value);
      parts.push(safeChunk.buffer);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const filename = decodeURIComponent(new URL(url).pathname.split("/").pop() || "media");
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "";
  if (mimeType && !/^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|ogg|wav|x-wav))$/.test(mimeType)) {
    throw new Error("O arquivo não é uma mídia suportada.");
  }
  return new File(parts, filename, { type: mimeType, lastModified: Date.now() });
}

/** Direct authorized media is importable; third-party embeds are preview-only. */
export function LinksImportPanel({ onImport }: { onImport: (file: File) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => {
    try { return url.trim() ? resolveMediaLink(url.trim(), typeof window !== "undefined" ? window.location.hostname : "") : null; }
    catch { return null; }
  }, [url]);

  const importMedia = async () => {
    if (!permission || !preview || preview.kind !== "direct" || busy) return;
    setBusy(true);
    try {
      await onImport(await fetchAuthorizedMedia(preview.url));
      toast.success("Mídia adicionada ao projeto.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar essa URL.");
    } finally { setBusy(false); }
  };

  return (
    <section className="mb-3 space-y-2 rounded-md border p-2" aria-label="Links e mídias externas">
      <strong className="text-xs">Links · prévia e importação autorizada</strong>
      <input type="url" aria-label="URL da mídia" placeholder="https://... (YouTube, Twitch ou arquivo direto)"
        className="bg-background w-full rounded border px-2 py-1 text-xs"
        value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2048} />
      {url.trim() && !preview && <p className="text-xs text-amber-500">URL HTTPS inválida ou não suportada.</p>}
      {preview?.embed && (
        <>
          <div className="aspect-video overflow-hidden rounded bg-black">
            <iframe title={"Prévia " + preview.kind} src={preview.embed}
              className="size-full" allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
          </div>
          <p className="text-muted-foreground text-[11px]">Visualizável somente. A incorporação não autoriza download ou exportação.</p>
        </>
      )}
      {preview?.kind === "external" && (
        <p className="text-muted-foreground text-[11px]">Página externa: sem importação ou captura automática. Use um arquivo original autorizado.</p>
      )}
      {preview?.kind === "direct" && (
        <>
          <label className="flex gap-2 text-[11px]">
            <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} />
            Confirmo que tenho autorização para importar e utilizar essa mídia.
          </label>
          <button type="button" disabled={!permission || busy} onClick={() => void importMedia()}
            className="rounded border px-2 py-1 text-xs disabled:opacity-40">
            {busy ? "Importando…" : "Importar arquivo ao projeto"}
          </button>
          <p className="text-muted-foreground text-[11px]">Importável/exportável somente se o servidor permitir CORS e o arquivo for compatível; limite de 200 MB.</p>
        </>
      )}
    </section>
  );
}
