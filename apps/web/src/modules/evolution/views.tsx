"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {PanelView} from "@/components/editor/panels/assets/views/base-panel";
import {useEditor} from "@/editor/use-editor";
import {useEvolution} from "./client";
import {useAssetsPanelStore} from "@/components/editor/panels/assets/assets-panel-store";
export function ModulesView(){
  const projectId=useEditor(e=>e.project.getActiveOrNull()?.metadata.id??"");
  const {status,error,busy,action}=useEvolution(projectId);
  const setTab=useAssetsPanelStore(s=>s.setActiveTab);
  const state=status?.installation;
  return <PanelView title="Extensões" contentClassName="p-3">
    <div className="rounded border p-3 space-y-3">
      <h3 className="font-medium text-sm">Evolution API · WhatsApp</h3>
      <p className="text-xs text-muted-foreground">Receba fotos, vídeos e áudios de um número autorizado. Instalação global, ativação por projeto.</p>
      {error&&<p className="text-xs text-destructive" role="alert">{error}</p>}
      {state==="installed"?<>
        <p className="text-xs">Instalado · {status?.enabled?"Ativo neste projeto":"Desativado neste projeto"}</p>
        <Button size="sm" variant="outline" onClick={()=>setTab("whatsapp")}>Configurar WhatsApp</Button>
        {status?.enabled&&<label className="flex gap-2 text-xs items-center"><input type="checkbox" role="switch" checked={true} disabled={busy} onChange={()=>void action({action:"configure",enabled:false})}/>Ativo nesta edição</label>}
      </>:<>
        <Button size="sm" disabled={busy||!status||state==="queued"||state==="installing"} onClick={()=>void action({action:"install"})}>{state==="queued"?"Aguardando supervisor…":state==="installing"?"Instalando…":state==="failed"?"Tentar novamente":"Instalar"}</Button>
        {state==="failed"&&<p className="text-xs text-destructive">Instalação falhou: {status?.error??"consulte logs do host"}</p>}
        {state==="queued"&&<p className="text-xs text-muted-foreground">O supervisor do host precisa estar ativo.</p>}
      </>}
    </div>
  </PanelView>;
}
export function WhatsAppView(){
  const projectId=useEditor(e=>e.project.getActiveOrNull()?.metadata.id??"");
  const {status,error,busy,action}=useEvolution(projectId);
  const [number,setNumber]=useState(""),[sender,setSender]=useState<string|null>(null),[code,setCode]=useState("");
  const connected=status?.connection==="open";
  const active=status?.enabled===true;
  return <PanelView title="WhatsApp" contentClassName="p-3">
    <div className="space-y-3 text-xs">
      {error&&<p role="alert" className="text-destructive">{error}</p>}
      {status?.installation!=="installed"?<p>Módulo indisponível. Abra Extensões.</p>:!connected?<>
        <h3 className="text-sm font-medium">Conectar por número</h3>
        <label className="block">Seu telefone com DDI e DDD
          <input className="mt-1 w-full rounded border bg-background p-2" type="tel" value={number} onChange={e=>setNumber(e.target.value)} placeholder="+55 11 99999-9999"/>
        </label>
        <Button size="sm" disabled={busy||!number.trim()} onClick={async()=>{const d=await action({action:"pair",number});setCode(d?.code??"");}}>Conectar</Button>
        {code?<div className="rounded border p-3 space-y-2"><p>Digite este código no WhatsApp em Aparelhos conectados → Conectar dispositivo → Conectar com número de telefone.</p><p className="text-xl font-mono tracking-widest select-all">{code}</p></div>:<p>Se o código ainda não aparecer, tente Conectar novamente após alguns segundos.</p>}
        <p className="text-muted-foreground">Aguardando confirmação no WhatsApp. Não usamos QR Code na interface.</p>
      </>:<>
        <p className="font-medium text-sm">WhatsApp conectado</p>
        <label className="block">Número autorizado a enviar mídia
          <input className="mt-1 w-full rounded border bg-background p-2" type="tel" value={sender===null?status?.sender??"":sender} disabled={active||busy} onChange={e=>setSender(e.target.value)} placeholder="+55 11 99999-9999"/>
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" role="switch" checked={active} disabled={busy||(!active&&!(sender??status?.sender))} onChange={e=>void action({action:"configure",enabled:e.target.checked,sender:sender??status?.sender})}/>Ativar nesta edição</label>
        <p className="text-muted-foreground">{active?"Recebendo novas mídias somente deste número.":"Desativado: nenhum novo arquivo será recebido neste projeto."}</p>
        <p>Salve o projeto no host antes de ativar. Arquivos são adicionados à biblioteca de mídia, sem alterar a timeline.</p>
      </>}
      <h3 className="font-medium text-sm">Mídias recebidas ({status?.items.length??0})</h3>
      {status?.items.map(item=><div key={item.id} className="rounded border p-2 break-all">{item.name}<span className="block text-muted-foreground">{(item.size/1024/1024).toFixed(1)} MB</span></div>)}
      <p className="text-muted-foreground">Limite inicial: 32 MiB por arquivo; textos, grupos e formatos não editáveis são ignorados.</p>
    </div>
  </PanelView>;
}
