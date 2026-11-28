"use client";

import { useCallback, useEffect, useState } from "react";
import { getLanToken } from "@/lan-sync/client";
import { confirmCredentialTransport } from "./providers";

type TunnelStatus = {
  agentAvailable: boolean;
  configured?: boolean;
  validated?: boolean;
  active: boolean;
  url: string | null;
  error?: string;
};

async function requestTunnel(method: "GET" | "POST" | "DELETE" | "PUT", data?: { token: string }): Promise<TunnelStatus> {
  const token = getLanToken();
  if (!token) throw new Error("Conecte a LAN com o token do host antes de administrar o ngrok.");
  const response = await fetch("/api/integrations/ngrok", {
    method, cache: "no-store", headers: { "x-lan-sync-token": token, ...(data ? {"Content-Type":"application/json"} : {}) }, ...(data ? {body:JSON.stringify(data)} : {}),
  });
  const raw: unknown = await response.json();
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "ngrok indisponível");
  return {
    agentAvailable: data.agentAvailable !== false,
    active: data.active === true,
    configured: data.configured === true,
    validated: data.validated === true,
    url: typeof data.url === "string" ? data.url : null,
    error: typeof data.error === "string" ? data.error : undefined,
  };
}

export function NgrokMcpPanel() {
  const [info, setInfo] = useState<TunnelStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secret,setSecret] = useState("");
  const [message,setMessage] = useState("");
  const refresh = useCallback(async () => {
    try { setInfo(await requestTunnel("GET")); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao consultar ngrok"); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async () => {
    if (busy) return;
    setBusy(true);setError("");setMessage("");
    try { if (!confirmCredentialTransport()) return; const result=await requestTunnel("PUT",{token:secret.trim()});setInfo(result);setSecret("");setMessage("Authtoken validado pelo agente ngrok e salvo no backend."); } catch(err){setError(err instanceof Error?err.message:"Falha ao validar");}finally{setBusy(false);}
  };
  const copyConnection = async () => {
    setError(""); setMessage("");
    try {
      if (!confirmCredentialTransport()) return;
      const response = await fetch("/api/integrations/ngrok?connection=1", {headers:{"x-lan-sync-token":getLanToken()}, cache:"no-store"});
      const data = await response.json() as {endpoint?:string; accessToken?:string; error?:string};
      if (!response.ok || !data.endpoint || !data.accessToken) throw Error(data.error || "Configuração MCP indisponível.");
      const config = JSON.stringify({mcpServers:{"cut-editor":{url:data.endpoint,headers:{Authorization:"Bearer " + data.accessToken}}}}, null, 2);
      const instructions = "Conecte o servidor MCP Cut Editor usando Streamable HTTP. No cliente MCP compatível, adicione a configuração abaixo. Se ele usar campos separados, use a URL e o cabeçalho Authorization indicados. Execute initialize e tools/list para verificar a conexão. Não compartilhe o token publicamente; só execute alterações no projeto com minha autorização.\n\n" + config;
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(instructions);
      else {
        const field = document.createElement("textarea"); field.value = instructions; field.style.position="fixed"; field.style.opacity="0"; document.body.appendChild(field); field.select();
        try { if (!document.execCommand("copy")) throw Error("Não foi possível copiar. Use HTTPS ou localhost."); } finally { field.remove(); }
      }
      setMessage("Configuração copiada. Cole no cliente de IA compatível com MCP HTTP e cabeçalho Bearer.");
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao copiar conexão."); }
  };
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
      <label className="block">Authtoken do ngrok
        <input type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} placeholder={info?.configured?"Token salvo (oculto)":"Cole o authtoken do agente"} className="bg-background mt-1 w-full rounded border p-2"/>
      </label>
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={busy || !secret.trim() || info?.active} onClick={()=>void save()}>{busy?"Validando...":"Salvar e validar authtoken"}</button>
      <p className="text-muted-foreground">Use o Authtoken do painel ngrok, não a API Key REST. O token fica no arquivo privado do host; validar não publica o MCP.</p>
      {message && <p role="status">{message}</p>}
      {info?.url && <div className="space-y-2 rounded border p-2">
        <p className="break-all">{info.url}/mcp</p>
        <button type="button" className="w-full rounded border px-2 py-2 font-medium" onClick={()=>void copyConnection()}>Copiar configuração MCP para IA</button>
        <p className="text-muted-foreground">1. Copie a configuração. 2. No seu cliente de IA, adicione um servidor MCP remoto (Streamable HTTP). 3. Informe URL e Authorization Bearer; execute initialize e tools/list para validar.</p>
        <p className="text-muted-foreground">Nem todo chat aceita MCP remoto com cabeçalhos personalizados. A configuração contém uma credencial de acesso ao Editor, não o authtoken do ngrok. Não compartilhe publicamente.</p>
      </div>}
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-40"
        disabled={busy || !info?.agentAvailable || (!info.configured && !info.active)} onClick={() => void toggle()}>
        {busy ? "Aplicando..." : info?.active ? "Desativar túnel" : "Ativar túnel MCP"}
      </button>
      {error && <p role="alert" className="text-amber-500">{error}</p>}
      {!getLanToken() && <p className="text-muted-foreground">Para controlar o túnel, conecte a LAN no cabeçalho com o token administrativo do host.</p>}
    </section>
  );
}
