"use client";

import { useCallback, useEffect, useState } from "react";
import { getLanToken } from "@/lan-sync/client";

type TunnelStatus = {
  agentAvailable: boolean;
  active: boolean;
  url: string | null;
  error?: string;
};

async function requestTunnel(method: "GET" | "POST" | "DELETE"): Promise<TunnelStatus> {
  const token = getLanToken();
  if (!token) throw new Error("Conecte a LAN com o token do host antes de administrar o ngrok.");
  const response = await fetch("/api/integrations/ngrok", {
    method, cache: "no-store", headers: { "x-lan-sync-token": token },
  });
  const raw: unknown = await response.json();
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "ngrok indisponível");
  return {
    agentAvailable: data.agentAvailable !== false,
    active: data.active === true,
    url: typeof data.url === "string" ? data.url : null,
    error: typeof data.error === "string" ? data.error : undefined,
  };
}

export function NgrokMcpPanel() {
  const [info, setInfo] = useState<TunnelStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!getLanToken()) return;
    try { setInfo(await requestTunnel("GET")); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar ngrok"); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const toggle = async () => {
    if (busy) return;
    if (!info?.active && !window.confirm(
      "Ativar túnel público do MCP? O serviço ficará acessível pela internet, com token MCP obrigatório. O Editor e a biblioteca de mídia NÃO serão expostos.",
    )) return;
    setBusy(true); setError("");
    try {
      await requestTunnel(info?.active ? "DELETE" : "POST");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao alterar túnel"); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-2 rounded-md border p-2 text-xs" aria-label="MCP por ngrok">
      <div className="flex justify-between gap-2">
        <strong>MCP externo · ngrok</strong>
        <button type="button" className="underline" onClick={() => void refresh()}>Atualizar</button>
      </div>
      <p className="text-muted-foreground">Somente a porta interna do MCP é publicada. O editor, fotos, vídeos e API de sincronização não são incluídos.</p>
      <p>{info?.active ? "🟢 Túnel ativo" : info?.agentAvailable ? "⚪ Túnel desativado" : "⚠️ Agente ngrok indisponível"}</p>
      {info?.url && <p className="break-all">{info.url}/mcp</p>}
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-40"
        disabled={busy || !info?.agentAvailable} onClick={() => void toggle()}>
        {busy ? "Aplicando..." : info?.active ? "Desativar túnel" : "Ativar túnel MCP"}
      </button>
      {error && <p role="alert" className="text-amber-500">{error}</p>}
      {!getLanToken() && <p className="text-muted-foreground">Para controlar o túnel, conecte a LAN no cabeçalho com o token administrativo do host.</p>}
    </section>
  );
}
