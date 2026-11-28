"use client";
import { useCallback, useEffect, useState } from "react";
import { getLanToken } from "@/lan-sync/client";
import { Button } from "@/components/ui/button";

type UpdateInfo = {
  status: null | {
    activeCommit: string | null; stagedCommit: string | null;
    profile: string | null; recoveryRequired: boolean;
    monitor: { status: string; commit: string | null; checkedAt: string };
    exportedAt: string;
  };
  activity: { recentSessions: number | null; activeRenders: number | null; state: string };
  autoInstall: false;
};
const messages: Record<string,string> = {
  "no-public-stable-release":"Nenhuma release pública estável",
  "no-stable-manifest":"Release sem manifesto estável",
  "stable-manifest-discovered-unverified":"Release encontrada, assinatura ainda não validada",
  "check-failed":"Falha na consulta ao GitHub",
  "not-checked":"Aguardando verificação do host",
};
export function UpdatesSettings() {
  const [info,setInfo]=useState<UpdateInfo|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const refresh=useCallback(async ()=>{
    setLoading(true); setError("");
    try {
      const token=getLanToken();
      if (!token) throw Error("Conecte-se à LAN com seu token antes de consultar atualizações.");
      const response=await fetch("/api/updates/status",{headers:{"x-lan-sync-token":token},cache:"no-store",signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw Error("Falha ao consultar host (HTTP "+response.status+").");
      setInfo(await response.json() as UpdateInfo);
    } catch (e) {setInfo(null);setError(e instanceof Error?e.message:"Falha na consulta.");}
    finally {setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const s=info?.status;
  const short=(v:string|null|undefined)=>v?v.slice(0,12):"Não registrada";
  return <section className="space-y-3 p-3 text-xs">
    <h3 className="text-sm font-semibold">Atualizações do Cut Editor</h3>
    <p className="text-muted-foreground">Canal estável da main · instalação automática desabilitada nesta etapa.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {info && <>
      {!s && <p>Supervisor do host ainda não publicou status. Configure F13 no servidor.</p>}
      {s && <dl className="grid grid-cols-2 gap-2 rounded border p-2 break-words">
        <dt>Versão instalada</dt><dd>{short(s.activeCommit)}</dd>
        <dt>Versão preparada</dt><dd>{short(s.stagedCommit)}</dd>
        <dt>Release encontrada</dt><dd>{short(s.monitor.commit)}</dd>
        <dt>Perfil</dt><dd>{s.profile??"Não registrado"}</dd>
        <dt>Verificação GitHub</dt><dd>{messages[s.monitor.status]??"Desconhecido"}</dd>
        <dt>Última consulta</dt><dd>{s.monitor.checkedAt?new Date(s.monitor.checkedAt).toLocaleString("pt-BR"):"—"}</dd>
        <dt>Recuperação</dt><dd>{s.recoveryRequired?"Necessária no host":"Sem journal pendente"}</dd>
      </dl>}
      <div className="rounded border p-2 space-y-1">
        <p className="font-medium">Atividade observada</p>
        <p>Sessões recentes: {info.activity.recentSessions??"Desconhecido"}</p>
        <p>Renderizações pendentes/ativas: {info.activity.activeRenders??"Desconhecido"}</p>
        <p>{info.activity.state==="busy"?"Há atividade: não atualizar.":info.activity.state==="unknown"?"Estado inconclusivo.":"Nenhuma atividade observada."}</p>
        <p className="text-muted-foreground">A ausência de atividade não confirma que todos os projetos estão salvos. Instalação exige manutenção e backup no host.</p>
      </div>
    </>}
    <Button variant="outline" size="sm" disabled={loading} onClick={()=>void refresh()}>{loading?"Consultando…":"Atualizar status"}</Button>
    <a className="block underline" href="https://github.com/GustavoABA/Editor/releases" target="_blank" rel="noopener noreferrer">Ver releases no GitHub</a>
  </section>;
}
