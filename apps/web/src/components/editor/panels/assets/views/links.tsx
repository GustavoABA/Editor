"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    if (paths[0] === "videos" && /^\d+$/.test(paths[1] || "")) {
      return { kind: "twitch", url: parsed.toString(), embed: "https://player.twitch.tv/?video=v" + paths[1] + "&parent=" + encodeURIComponent(parent) + "&autoplay=false" };
    }
    const channel = paths[0] || "";
    if (!/^[A-Za-z0-9_]{3,25}$/.test(channel)) throw new Error("Canal da Twitch inválido.");
    if (paths.length >= 3 && paths[1] === "clip" && /^[A-Za-z0-9_-]+$/.test(paths[2])) {
      return { kind: "twitch", url: parsed.toString(), embed: "https://clips.twitch.tv/embed?clip=" + encodeURIComponent(paths[2]) + "&parent=" + encodeURIComponent(parent) };
    }
    return { kind: "twitch", url: parsed.toString(), embed: "https://player.twitch.tv/?channel=" + encodeURIComponent(channel) + "&parent=" + encodeURIComponent(parent) + "&muted=true" };
  }
  if (host === "clips.twitch.tv" && /^[A-Za-z0-9_-]+$/.test(parsed.pathname.slice(1))) {
    return { kind: "twitch", url: parsed.toString(), embed: "https://clips.twitch.tv/embed?clip=" + encodeURIComponent(parsed.pathname.slice(1)) + "&parent=" + encodeURIComponent(parent) };
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
  const [openedUrl, setOpenedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [captureSeconds, setCaptureSeconds] = useState(120);
  const [captureAllowed, setCaptureAllowed] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const captureRef = useRef<MediaStream | null>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureDiscard = useRef(false);
  useEffect(() => () => {
    captureDiscard.current = true;
    if (captureTimer.current) clearTimeout(captureTimer.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    captureRef.current?.getTracks().forEach(track => track.stop());
  }, []);
  const originalFileInputRef = useRef<HTMLInputElement>(null);
  const importOriginalFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    try {
      await onImport(file);
      toast.success("Arquivo original adicionado à mídia editável do projeto.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o arquivo original.");
    } finally { setBusy(false); }
  };
  const preview = useMemo(() => {
    try { return openedUrl.trim() ? resolveMediaLink(openedUrl.trim(), typeof window !== "undefined" ? window.location.hostname : "") : null; }
    catch { return null; }
  }, [openedUrl]);

  const stopCapture = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const recordSource = async () => {
    if (!preview || !captureAllowed || busy || recording) return;
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      toast.error("Captura de aba exige navegador compatível e HTTPS ou localhost.");
      return;
    }
    setBusy(true);
    captureDiscard.current = false;
    let stream: MediaStream | null = null;
    try {
      // Browser-owned chooser: cannot silently select a tab or bypass protected content.
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      captureRef.current = stream;
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw Error("O navegador não oferece gravação WebM compatível.");
      const recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 4_000_000});
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = e => {
        if (e.data.size && bytes + e.data.size <= MAX_FILE_BYTES) {chunks.push(e.data); bytes += e.data.size;}
        else if (e.data.size) { captureDiscard.current = true; stopCapture(); toast.error("Captura ultrapassou 200 MB; reduza a duração."); }
      };
      recorder.onerror = () => { captureDiscard.current = true; stopCapture(); toast.error("Falha durante a captura."); };
      recorder.onstop = async () => {
        if (captureTimer.current) clearTimeout(captureTimer.current);
        captureTimer.current = null;
        stream?.getTracks().forEach(track => track.stop());
        captureRef.current = null; recorderRef.current = null;
        setRecording(false);
        try {
          if (!captureDiscard.current && chunks.length) {
            const blob = new Blob(chunks, {type: mimeType});
            await onImport(new File([blob], "link-capturado-" + Date.now() + ".webm", {type:"video/webm"}));
            toast.success("Captura adicionada à biblioteca. Arraste e corte na timeline.");
          }
        } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao importar captura."); }
        finally { setBusy(false); }
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", stopCapture, {once:true});
      recorder.start(1000);
      setRecording(true);
      captureTimer.current = setTimeout(stopCapture, Math.min(300, Math.max(1, captureSeconds || 120))*1000);
      if (!stream.getAudioTracks().length) toast.warning("A aba não compartilhou áudio. A gravação será apenas visual.");
      else toast.info("Captura iniciada. Reproduza a fonte desde o ponto inicial desejado.");
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      captureRef.current = null; recorderRef.current = null;
      setBusy(false); setRecording(false);
      toast.error(error instanceof Error ? error.message : "Captura cancelada ou indisponível.");
    }
  };

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
        disabled={busy} value={url} onChange={(e) => { setUrl(e.target.value); setPermission(false); setCaptureAllowed(false); }} maxLength={2048} onKeyDown={e => { if (e.key === "Enter") { setPermission(false); setCaptureAllowed(false); setOpenedUrl(url.trim()); } }} />
      <div className="flex gap-2"><button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => { setPermission(false); setOpenedUrl(url.trim()); }}>Abrir link</button><button type="button" className="rounded border px-2 py-1 text-xs" disabled={busy} onClick={() => { setOpenedUrl(""); setUrl(""); setPermission(false); setCaptureAllowed(false); }}>Fechar</button></div>
      {openedUrl.trim() && !preview && <p className="text-xs text-amber-500">URL HTTPS inválida ou não suportada.</p>}
      {preview?.embed && (
        <>
          <div className="aspect-video overflow-hidden rounded bg-black">
            <iframe title={"Prévia " + preview.kind} src={preview.embed}
              className="size-full" allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
          </div>
          <p className="text-muted-foreground text-[11px]">
            Prévia externa: o player do YouTube/Twitch não fornece quadros para a timeline nem pode ser exportado como MP4 por este editor. Alguns vídeos proíbem incorporação.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a href={preview.url} target="_blank" rel="noopener noreferrer"
              className="rounded border px-2 py-1 text-xs underline">Abrir vídeo original</a>
            <input ref={originalFileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime"
              className="hidden" aria-label="Selecionar arquivo de vídeo original"
              onChange={event => void importOriginalFile(event)} />
            <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40"
              disabled={busy} onClick={() => originalFileInputRef.current?.click()}>
              {busy ? "Importando original…" : "Importar meu arquivo original MP4"}
            </button>
          </div>
          <p className="text-muted-foreground text-[11px]">
            Para editar e exportar, use o arquivo original que você possui e tem direito de utilizar.
          </p>
        </>
      )}
      {preview?.kind === "external" && (
        <div className="space-y-2">
          <iframe title="Página externa" src={preview.url} className="h-80 w-full rounded border" sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" />
          <p className="text-muted-foreground text-[11px]">Alguns sites bloqueiam incorporação. A página é isolada, não é uma mídia exportável.</p>
          <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">Abrir original</a>
        </div>
      )}
      {preview?.kind === "direct" && (
        <>
          {/\.(png|jpe?g|gif|webp)$/i.test(new URL(preview.url).pathname) ? <img src={preview.url} alt="Prévia da imagem" className="max-h-72 w-full object-contain" referrerPolicy="no-referrer" /> : /\.(mp3|ogg|wav|m4a)$/i.test(new URL(preview.url).pathname) ? <audio controls src={preview.url} className="w-full" preload="metadata" /> : <video controls playsInline src={preview.url} className="max-h-72 w-full bg-black" preload="metadata" />}
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
      {preview && preview.kind !== "direct" && <div className="space-y-2 rounded border p-2 text-xs">
        <strong>Transformar prévia em mídia editável</strong>
        <p className="text-muted-foreground">Abra a fonte em uma aba separada, posicione no início e pause. Inicie a captura, selecione essa aba e compartilhe áudio se disponível; depois reproduza a fonte. A captura acontece em tempo real. Corte o WebM na timeline e exporte normalmente.</p>
        <a href={preview.url} target="_blank" rel="noopener noreferrer" className="underline">Abrir fonte em outra aba</a>
        <label className="flex gap-2"><input type="checkbox" checked={captureAllowed} disabled={busy} onChange={e=>setCaptureAllowed(e.target.checked)} />Tenho autorização para gravar e editar essa fonte. Não capture conteúdo protegido ou dados privados.</label>
        <label className="block">Limite de captura (segundos, até 300)<input type="number" min={1} max={300} value={captureSeconds} disabled={busy} onChange={e=>setCaptureSeconds(Number(e.target.value))} className="ml-2 w-20 rounded border bg-background p-1" /></label>
        {recording ? <button type="button" className="rounded border px-2 py-2" onClick={stopCapture}>Parar e importar captura</button> : <button type="button" disabled={busy || !captureAllowed} className="rounded border px-2 py-2 disabled:opacity-40" onClick={()=>void recordSource()}>Capturar aba autorizada</button>}
        <p className="text-muted-foreground">O arquivo gravado é independente da conexão durante a exportação. Lives não têm necessariamente um ponto zero; sites ou conteúdo protegido podem impedir captura. O navegador pede sua autorização.</p>
      </div>}
    </section>
  );
}
