"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  downloadRemoteAsset, getLanToken, listRemoteProjects, readRemoteProject,
  setKnownRevision, setLanToken,
} from "@/lan-sync/client";
import { storageService } from "@/services/storage/service";
import { processMediaAssets } from "@/media/processing";
import type { SerializedProject } from "@/services/storage/types";

const MAX_REMOTE_BROWSER_FILE = 80 * 1024 * 1024;

type ListedProject = { id: string; name: string; revision: number; updatedAt: string };

/** Load an editable revision from the host, not an exported MP4. */
export function LanRemoteProjectsPanel() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [projects, setProjects] = useState<ListedProject[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setError("");
      const result = await listRemoteProjects();
      setProjects(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar o servidor LAN.");
    }
  };

  useEffect(() => {
    setToken(getLanToken());
    if (getLanToken()) void refresh();
  }, []);

  const connect = async () => {
    setLanToken(token.trim());
    await refresh();
  };

  const open = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      const remote = await readRemoteProject(id);
      if (!remote) throw new Error("O projeto não existe mais no servidor");
      const existing = await storageService.loadProject({ id });
      if (existing && !window.confirm("Este navegador já contém uma cópia deste projeto. Substituir pelo estado do host? Alterações locais não sincronizadas podem ser perdidas.")) return;

      const missing: string[] = [];
      // Remote originals are currently imported into browser storage. Larger assets
      // require a future proxy/range streaming implementation to remain lightweight.
      for (const asset of remote.assets) {
        if (!asset.uploaded) {
          missing.push(asset.name + " (upload pendente)");
          continue;
        }
        if (asset.size > MAX_REMOTE_BROWSER_FILE) {
          missing.push(asset.name + " (grande demais para a importação web atual)");
          continue;
        }
        try {
          const file = await downloadRemoteAsset(id, asset);
          const processed = await processMediaAssets({ files: [file] });
          const item = processed[0];
          if (!item) throw new Error("Formato indisponível neste navegador");
          await storageService.saveMediaAsset({ projectId: id, mediaAsset: { ...item, id: asset.id } });
        } catch {
          missing.push(asset.name + " (não disponível neste aparelho)");
        }
      }
      const document = remote.document as unknown as SerializedProject;
      if (document.metadata?.id !== id || !Array.isArray(document.scenes)) throw new Error("Documento remoto inválido");
      await storageService.importSerializedProject({ project: document });
      setKnownRevision(id, remote.revision);
      if (missing.length) {
        sessionStorage.setItem("opencut-lan-missing:" + id, JSON.stringify(missing));
        toast.warning("⚠️ Algumas mídias ainda não estão disponíveis neste aparelho", {
          description: missing.slice(0, 3).join("; "),
        });
      } else {
        sessionStorage.removeItem("opencut-lan-missing:" + id);
      }
      router.push("/editor/" + id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao abrir projeto do host");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mx-4 rounded-lg border p-3" aria-label="Projetos no servidor LAN">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">Projetos do servidor LAN</strong>
        <input type="password" autoComplete="off" aria-label="Token do servidor LAN"
          className="bg-background w-40 rounded border px-2 py-1 text-xs"
          placeholder="Token privado do host" value={token}
          onChange={(e) => setToken(e.target.value)} />
        <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => void connect()}>
          Conectar / Atualizar
        </button>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        Projetos editáveis no host. Mídias não enviadas permanecem pendentes ⚠️.
        Nesta primeira versão, originais acima de 80 MB não são baixados no cliente;
        será necessário implementar proxies para visualizá-los remotamente.
      </p>
      {error && <p role="alert" className="mt-2 text-xs text-amber-500">{error}</p>}
      {!!projects.length && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {projects.map((project) => (
            <li key={project.id} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
              <span>{project.name} (rev. {project.revision})</span>
              <button type="button" disabled={busy !== null} className="underline disabled:opacity-40"
                onClick={() => void open(project.id)}>
                {busy === project.id ? "Carregando..." : "Continuar edição"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
