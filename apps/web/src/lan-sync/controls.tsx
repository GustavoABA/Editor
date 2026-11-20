"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { storageService } from "@/services/storage/service";
import {
  checkpointRemoteProject, getKnownRevision, getLanToken, LanSyncError,
  listRemoteProjects, readRemoteProject, saveRemoteProject, setKnownRevision,
  setLanToken, uploadRemoteAsset,
} from "./client";

type UploadState = { status: "uploading" | "verified" | "failed"; progress: number };
const CHECKPOINT_MS = 180_000;

/**
 * Client-first LAN sync: previews and timeline actions never await the original upload.
 * Remote persistence is opt-in until the administrator sets a separate LAN_SYNC_TOKEN.
 */
export function LanSyncControls() {
  const editor = useEditor();
  const projectId = useEditor((e) => e.project.getActiveOrNull()?.metadata.id);
  const [connected, setConnected] = useState(false);
  const [isConfiguring, setConfiguring] = useState(false);
  const [draftToken, setDraftToken] = useState("");
  const [status, setStatus] = useState("LAN não conectada");
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const [busy, setBusy] = useState(false);
  const [remoteMissing, setRemoteMissing] = useState<string[]>([]);
  const inFlight = useRef(new Set<string>());
  const completed = useRef(new Set<string>());
  const retryAfter = useRef(new Map<string, number>());
  const documentBusy = useRef(false);
  const lastDocumentFingerprint = useRef<string | null>(null);

  const connect = useCallback(async (candidate: string) => {
    setLanToken(candidate.trim());
    try {
      await listRemoteProjects();
      setConnected(true);
      setConfiguring(false);
      setStatus("LAN conectada");
    } catch (error) {
      setConnected(false);
      setStatus(error instanceof Error ? error.message : "LAN indisponível");
    }
  }, []);

  useEffect(() => {
    const saved = getLanToken();
    if (saved) void connect(saved);
  }, [connect]);
  useEffect(() => {
    if (!projectId) return;
    try {
      const values: unknown = JSON.parse(sessionStorage.getItem("opencut-lan-missing:" + projectId) || "[]");
      setRemoteMissing(Array.isArray(values) ? values.filter((item): item is string => typeof item === "string") : []);
    } catch { setRemoteMissing([]); }
  }, [projectId]);

  const syncDocument = useCallback(async (checkpoint = false) => {
    if (!connected || !projectId || documentBusy.current) return;
    const active = editor.project.getActiveOrNull();
    if (!active || active.metadata.id !== projectId) return;
    const assets = editor.media.getAssets();
    const scenes = editor.scenes.getScenes();
    const fingerprint = JSON.stringify({
      scenes, settings: active.settings, name: active.metadata.name,
      media: assets.map((a) => ({ id: a.id, size: a.file.size, name: a.name })),
    });
    if (!checkpoint && lastDocumentFingerprint.current === fingerprint) return;
    documentBusy.current = true;
    setBusy(true);
    try {
      await editor.project.saveCurrentProject();
      const serialized = await storageService.readSerializedProject({ id: projectId });
      if (!serialized) throw new Error("Rascunho local ainda não disponível");
      let revision = getKnownRevision(projectId);
      if (revision === null) {
        const remote = await readRemoteProject(projectId);
        if (remote) {
          throw new Error("O projeto já existe no host. Abra a revisão do host para evitar sobrescrever outra edição.");
        }
        revision = 0;
      }
      // Retain references to originals that are still uploading or absent on this device.
      const remote = await readRemoteProject(projectId);
      const localManifest = assets.map((a) => ({
        id: a.id, name: a.name, type: a.type, size: a.file.size, mimeType: a.file.type,
      }));
      const knownIds = new Set(localManifest.map((asset) => asset.id));
      const pendingRemote = (remote?.assets ?? []).filter((asset) => !knownIds.has(asset.id));
      const result = await saveRemoteProject({
        projectId, baseRevision: revision,
        document: serialized as unknown as Record<string, unknown>,
        assets: [...localManifest, ...pendingRemote],
      });
      setKnownRevision(projectId, result.revision);
      lastDocumentFingerprint.current = fingerprint;
      if (checkpoint) await checkpointRemoteProject(projectId);
      setStatus(checkpoint ? "Checkpoint salvo no host" : "Projeto salvo no host");
    } catch (error) {
      setStatus(error instanceof LanSyncError && error.status === 409
        ? "⚠️ Conflito de revisão: reabra o projeto remoto antes de salvar"
        : "⚠️ " + (error instanceof Error ? error.message : "Falha ao salvar no host"));
    } finally {
      documentBusy.current = false;
      setBusy(false);
    }
  }, [connected, editor, projectId]);

  useEffect(() => {
    if (!connected || !projectId) return;
    void syncDocument(false);
    const quick = window.setInterval(() => void syncDocument(false), 8_000);
    const checkpoints = window.setInterval(() => void syncDocument(true), CHECKPOINT_MS);
    return () => {
      window.clearInterval(quick);
      window.clearInterval(checkpoints);
    };
  }, [connected, projectId, syncDocument]);

  useEffect(() => {
    if (!connected || !projectId) return;
    let disposed = false;
    const uploadNewAssets = () => {
      for (const asset of editor.media.getAssets()) {
        if (completed.current.has(asset.id) || inFlight.current.has(asset.id)) continue;
        if ((retryAfter.current.get(asset.id) ?? 0) > Date.now()) continue;
        inFlight.current.add(asset.id);
        setUploadStates((s) => ({ ...s, [asset.id]: { status: "uploading", progress: 0 } }));
        void uploadRemoteAsset({
          projectId, asset,
          onProgress: (progress) => {
            if (!disposed) setUploadStates((s) => ({
              ...s, [asset.id]: { status: "uploading", progress },
            }));
          },
        }).then(() => {
          completed.current.add(asset.id);
          if (!disposed) setUploadStates((s) => ({
            ...s, [asset.id]: { status: "verified", progress: 1 },
          }));
        }).catch((error: unknown) => {
          retryAfter.current.set(asset.id, Date.now() + 20_000);
          console.warn("[lan-sync] upload pending:", asset.name, error);
          if (!disposed) setUploadStates((s) => ({
            ...s, [asset.id]: { status: "failed", progress: 0 },
          }));
        }).finally(() => inFlight.current.delete(asset.id));
      }
    };
    const unsubscribe = editor.media.subscribe(uploadNewAssets);
    const interval = window.setInterval(uploadNewAssets, 4_000);
    uploadNewAssets();
    return () => {
      disposed = true;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [connected, editor, projectId]);

  useEffect(() => {
    if (!connected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void syncDocument(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [connected, syncDocument]);

  const pending = editor.media.getAssets().filter((asset) => !completed.current.has(asset.id));
  const count = pending.length;
  const failed = pending.filter((asset) => uploadStates[asset.id]?.status === "failed").length;
  const progress = pending.find((asset) => uploadStates[asset.id]?.status === "uploading");

  return (
    <div className="flex items-center gap-2 text-xs">
      {connected ? (
        <>
          <span className={count ? "text-amber-500" : "text-emerald-500"} title={status}>
            {(count || remoteMissing.length) ? `⚠️ ${count + remoteMissing.length} mídia(s) pendentes` : "✓ Mídias no host"}
            {failed ? ` · ${failed} falha(s)` : ""}
            {progress ? ` · ${Math.round((uploadStates[progress.id]?.progress ?? 0) * 100)}%` : ""}
          </span>
          <button type="button" className="rounded border px-2 py-1 disabled:opacity-50"
            disabled={busy} onClick={() => void syncDocument(true)}
            title={status}> {busy ? "Salvando..." : "Salvar no host"} </button>
          <button type="button" className="text-muted-foreground underline"
            onClick={() => { setLanToken(""); setConnected(false); setStatus("LAN desconectada"); }}>
            Sair LAN
          </button>
        </>
      ) : (
        <>
          <button type="button" className="rounded border px-2 py-1"
            onClick={() => setConfiguring((v) => !v)}>Conectar LAN</button>
          {isConfiguring && (
            <form className="flex gap-1" onSubmit={(event) => {
              event.preventDefault();
              void connect(draftToken);
            }}>
              <input type="password" autoComplete="off" aria-label="Token privado do host LAN"
                placeholder="Token do host" value={draftToken}
                onChange={(event) => setDraftToken(event.target.value)}
                className="bg-background w-36 rounded border px-1 py-1" />
              <button type="submit" className="rounded border px-2">Entrar</button>
            </form>
          )}
        </>
      )}
      <span className="sr-only" aria-live="polite">{status}</span>
    </div>
  );
}
