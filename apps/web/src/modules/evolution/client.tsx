"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useEditor} from "@/editor/use-editor";
import {getLanToken} from "@/lan-sync/client";
import {processMediaAssets} from "@/media/processing";
import {toast} from "sonner";
import {create} from "zustand";
type Item={id:string;name:string;mimeType:string;size:number;receivedAt:string};
type Status={installation:string;connection:string;enabled:boolean;sender:string;error:string|null;items:Item[]};
type ModuleStore={projectId:string;status:Status|null;error:string;set:(projectId:string,status:Status|null,error?:string)=>void};
export const useEvolutionStore=create<ModuleStore>(set=>({projectId:"",status:null,error:"",set:(projectId,status,error="")=>set({projectId,status,error})}));
export async function moduleRequest(projectId:string,body?:Record<string,unknown>,asset?:string){
  const token=getLanToken();if(!token)throw Error("Configure o token LAN para usar extensões.");
  const url="/api/modules/evolution?projectId="+encodeURIComponent(projectId)+(asset?"&asset="+encodeURIComponent(asset):"");
  const res=await fetch(url,{method:body?"POST":"GET",headers:{"x-lan-sync-token":token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify({...body,projectId}):undefined,cache:"no-store",signal:AbortSignal.timeout(body?180_000:75_000)});
  if(!res.ok){const d=await res.json().catch(()=>null);throw Error(d?.error??"Falha no módulo (HTTP "+res.status+").");}
  return res;
}
export function EvolutionBridge(){
  const editor=useEditor();
  const projectId=useEditor(e=>e.project.getActiveOrNull()?.metadata.id??"");
  const retry=useRef(new Map<string,number>());
  useEffect(()=>{
    let stopped=false,running=false;
    const update=async()=>{
      if(stopped||running||!projectId)return;
      running=true;
      try{
        if(!getLanToken()){if(!stopped)useEvolutionStore.getState().set(projectId,null,"Configure o token LAN.");return;}
        const s=await (await moduleRequest(projectId)).json() as Status;
        if(stopped||editor.project.getActiveOrNull()?.metadata.id!==projectId)return;
        useEvolutionStore.getState().set(projectId,s);
        // The inbox is persisted on the host even while the editor is closed.
        // Import as ordinary media, with a stable ID and existing thumbnail pipeline.
        if(!s.enabled||editor.media.isLoadingMedia())return;
        for(const item of s.items){
          if(stopped||editor.project.getActiveOrNull()?.metadata.id!==projectId)break;
          if(editor.media.getAssets().some(a=>a.id===item.id))continue;
          const key="cut-editor-wa-imported:"+projectId+":"+item.id;
          try{
            if(localStorage.getItem(key)==="1")continue;
            if((retry.current.get(key)??0)>Date.now())continue;
            const blob=await (await moduleRequest(projectId,undefined,item.id)).blob();
            if(blob.size!==item.size)throw Error("Tamanho divergente.");
            const assets=await processMediaAssets({files:[new File([blob],item.name,{type:item.mimeType})]});
            if(!assets.length)throw Error("Formato incompatível com este navegador.");
            if(stopped||editor.project.getActiveOrNull()?.metadata.id!==projectId||!useEvolutionStore.getState().status?.enabled)break;
            const added=await editor.media.addMediaAsset({projectId,asset:assets[0],assetId:item.id});
            if(!added)throw Error("Não foi possível salvar a mídia.");
            localStorage.setItem(key,"1");
            toast.success("WhatsApp: "+item.name+" adicionado às mídias.");
          }catch(e){
            retry.current.set(key,Date.now()+60_000);
            if(!stopped)toast.error(e instanceof Error?e.message:"Falha ao importar mídia do WhatsApp.");
          }
          break; // one file per poll to keep mobile memory bounded
        }
      }catch(e){if(!stopped)useEvolutionStore.getState().set(projectId,null,e instanceof Error?e.message:"Falha ao consultar módulo.");}
      finally{running=false;}
    };
    useEvolutionStore.getState().set(projectId,null);
    void update();const timer=window.setInterval(()=>void update(),5000);
    const refresh=()=>void update();window.addEventListener("cut-editor-modules-refresh",refresh);
    return()=>{stopped=true;window.clearInterval(timer);window.removeEventListener("cut-editor-modules-refresh",refresh);};
  },[editor,projectId]);
  return null;
}
export function useEvolution(projectId:string){
  const store=useEvolutionStore();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const action=useCallback(async(body:Record<string,unknown>)=>{
    setBusy(true);setError("");
    try{
      const res=await moduleRequest(projectId,body);const data=await res.json();
      window.dispatchEvent(new Event("cut-editor-modules-refresh"));return data;
    }catch(e){setError(e instanceof Error?e.message:"Falha no módulo.");return null;}
    finally{setBusy(false);}
  },[projectId]);
  return {status:store.projectId===projectId?store.status:null,error:error||store.error,busy,action};
}
