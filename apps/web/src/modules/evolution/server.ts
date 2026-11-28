import {createHash,randomUUID,timingSafeEqual} from "node:crypto";
import {mkdir,readFile,writeFile,rename,readdir,rm,mkdtemp,open,stat} from "node:fs/promises";
import path from "node:path";
import {readProject,storeChunk,finalizeAsset,getAssetRecord,assetFilePath} from "@/lan-sync/server";
import {INSTANCE,MAX_CONFIGURED_MEDIA_BYTES,mediaLimit,MAX_INBOX_BYTES,MIME_EXTENSIONS,incoming,phone,validProject,record} from "./policy";
import {decodeMediaResponse} from "./media-stream";

const root=path.join(process.env.LAN_SYNC_DIR||"/app/lan-sync","modules","evolution");
type Host={state:string;requestId?:string;apiKey?:string;webhookSecret?:string;error?:string};
type Rule={enabled:boolean;sender:string;enabledAt:number};
type Item={id:string;name:string;mimeType:string;size:number;receivedAt:string};
type Inbound = NonNullable<ReturnType<typeof incoming>>;
type Job={id:string;projectId:string;rule:Rule;msg:Inbound;attempts:number;nextAt:number;state:"pending"|"failed";error?:string};
const jobsDir=path.join(root,"queue");
const maxMediaBytes=()=>mediaLimit(process.env.EVOLUTION_MAX_MEDIA_MIB);
// Share the lock across Next route bundles in the same Node process.
const globalLock=globalThis as typeof globalThis & {cutEditorEvolutionQueue?:Promise<void>;cutEditorEvolutionWorking?:boolean};
async function exclusive<T>(fn:()=>Promise<T>):Promise<T>{
  const previous=globalLock.cutEditorEvolutionQueue??Promise.resolve(); let release!:()=>void;
  globalLock.cutEditorEvolutionQueue=new Promise<void>(r=>{release=r;});
  await previous; try{return await fn();}finally{release();}
}
async function json<T>(file:string,fallback:T):Promise<T>{
  try{return JSON.parse(await readFile(file,"utf8")) as T;}
  catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return fallback;throw e;}
}
async function write(file:string,data:unknown){
  await mkdir(path.dirname(file),{recursive:true});
  const tmp=file+"."+randomUUID()+".tmp";
  try{await writeFile(tmp,JSON.stringify(data),{mode:0o600});await rename(tmp,file);}
  finally{await rm(tmp,{force:true}).catch(()=>undefined);}
}
const host=()=>json<Host>(path.join(root,"host.json"),{state:"not-installed"});
const rules=()=>json<Record<string,Rule>>(path.join(root,"projects.json"),{});
function projectDir(id:string){if(!validProject(id))throw Error("Projeto inválido.");return path.join(root,"inbox",id);}
async function items(id:string){
  const dir=projectDir(id);
  const names=await readdir(dir).catch((e:NodeJS.ErrnoException)=>{if(e.code==="ENOENT")return [];throw e;});
  const all=await Promise.all(names.filter(n=>/^wa-[a-f0-9]{40}\.json$/.test(n)).map(n=>json<Item|null>(path.join(dir,n),null)));
  return all.filter((x):x is Item=>x!==null).sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt));
}
export async function install(){
  return exclusive(async()=>{
    const h=await host();
    if(h.state==="installed"||h.state==="installing")return;
    const file=path.join(root,"install.json");
    const previous=await json<{id?:string;createdAt?:number}>(file,{});
    if(previous.id && previous.id!==h.requestId && Date.now()-Number(previous.createdAt)<300_000)return;
    await write(file,{id:randomUUID(),action:"install",createdAt:Date.now()});
  });
}
async function boundedJson(response:Response,limit:number){
  if(!response.body)throw Error("Resposta vazia.");
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>limit)throw Error("Resposta acima do limite.");chunks.push(next.value);}
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  }finally{await reader.cancel().catch(()=>undefined);}
}
async function evoResponse(route:string,h:Host,body?:unknown){
  if(h.state!=="installed"||!h.apiKey)throw Error("Módulo não instalado.");
  const res=await fetch("http://evolution:8080"+route,{method:body===undefined?"GET":"POST",headers:{apikey:h.apiKey,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(route.startsWith("/instance/connectionState/") ? 5000 : 60_000)});
  if(!res.ok){const e=new Error("Evolution API: HTTP "+res.status);e.name=String(res.status);throw e;}
  return res;
}
async function evo(route:string,h:Host,body?:unknown,limit=1024*1024){return boundedJson(await evoResponse(route,h,body),limit);}
async function connection(h:Host){
  try{const d=await evo("/instance/connectionState/"+INSTANCE,h);return record(d)&&record(d.instance)&&typeof d.instance.state==="string"?d.instance.state:"unknown";}
  catch{return "unavailable";}
}
export async function status(projectId:string){
  const h=await host();
  const req=await json<{id?:string;createdAt?:number}>(path.join(root,"install.json"),{});
  const pending=req.id && req.id!==h.requestId && Date.now()-Number(req.createdAt)<300_000;
  const config=(await rules())[projectId];
  const heartbeat=await json<{checkedAt?:number}>(path.join(root,"heartbeat.json"),{});
  const supervisorOnline=Date.now()-Number(heartbeat.checkedAt)<180_000;
  return {maxMediaBytes:maxMediaBytes(),supervisorOnline,installation:pending?"queued":h.state,error:h.state==="failed"?h.error:null,
    connection:h.state==="installed"?await connection(h):"unavailable",
    enabled:config?.enabled===true,sender:config?.sender??"",items:await items(projectId),queue:(await listJobs()).filter(j=>j.projectId===projectId).map(j=>({id:j.id,state:j.state,attempts:j.attempts,error:j.error??null}))};
}
export async function pair(number:unknown){
  const n=phone(number);if(!n)throw Error("Informe o telefone com DDI e DDD.");
  return exclusive(async()=>{
    const h=await host();
    if(!h.webhookSecret)throw Error("Módulo não instalado.");
    const current=await connection(h);
    if(current==="open")return {connected:true,code:null};
    const webhook={enabled:true,url:"http://web:3000/api/modules/evolution/webhook/"+h.webhookSecret,byEvents:false,base64:false,events:["MESSAGES_UPSERT"]};
    try{await evo("/instance/create",h,{instanceName:INSTANCE,integration:"WHATSAPP-BAILEYS",qrcode:false,number:n,webhook});}
    catch(e){if(!(e instanceof Error)||!["403","409"].includes(e.name))throw e;}
    await evo("/webhook/set/"+INSTANCE,h,{webhook});
    const result=await evo("/instance/connect/"+INSTANCE+"?number="+encodeURIComponent(n),h);
    const code=record(result)&&typeof result.pairingCode==="string"&&/^[A-Za-z0-9-]{4,20}$/.test(result.pairingCode)?result.pairingCode:null;
    return {connected:false,code};
  });
}
export async function configure(projectId:string,enabled:boolean,sender:unknown){
  if(!validProject(projectId))throw Error("Projeto inválido.");
  return exclusive(async()=>{
    const all=await rules();
    if(!enabled){all[projectId]={enabled:false,sender:all[projectId]?.sender??"",enabledAt:0};await write(path.join(root,"projects.json"),all);return;}
    if(!await readProject(projectId))throw Error("Salve o projeto no host antes de ativar.");
    const n=phone(sender);
    if(!n)throw Error("Informe o remetente com DDI e DDD.");
    if(await connection(await host())!=="open")throw Error("Conecte o WhatsApp primeiro.");
    if(Object.entries(all).some(([id,rule])=>id!==projectId&&rule.enabled&&rule.sender===n))throw Error("Este remetente já está ativo em outro projeto. Desative-o lá primeiro.");
    all[projectId]={enabled:true,sender:n,enabledAt:Date.now()};await write(path.join(root,"projects.json"),all);
  });
}
export async function authorizedWebhook(secret:string){
  const h=await host();const a=Buffer.from(secret),b=Buffer.from(h.webhookSecret??"");
  return h.state==="installed"&&b.length===64&&a.length===b.length&&timingSafeEqual(a,b);
}
function jobPath(id:string){if(!/^wa-[a-f0-9]{40}$/.test(id))throw Error("ID inválido.");return path.join(jobsDir,id+".json");}
async function listJobs(){
  const names=await readdir(jobsDir).catch((e:NodeJS.ErrnoException)=>{if(e.code==="ENOENT")return [];throw e;});
  const all:Job[]=[];
  for(const n of names.filter(n=>/^wa-[a-f0-9]{40}\.json$/.test(n))){
    const job=await json<Job|null>(path.join(jobsDir,n),null);
    if(job)all.push(job);
  }
  return all;
}
function sameRule(a:Rule|undefined,b:Rule){return a?.enabled===true&&a.sender===b.sender&&a.enabledAt===b.enabledAt;}
export async function receive(payload:unknown){
  const msg=incoming(payload,maxMediaBytes());if(!msg)return {ignored:true};
  return exclusive(async()=>{
    const all=await rules();
    const targets=Object.entries(all).filter(([,rule])=>rule.enabled&&rule.sender===msg.sender&&msg.timestamp>=Math.floor(rule.enabledAt/1000)*1000&&msg.timestamp<=Date.now()+60_000);
    if(targets.length!==1)return {ignored:true};
    const [projectId,rule]=targets[0];if(!await readProject(projectId))return {ignored:true};
    const id="wa-"+createHash("sha256").update(INSTANCE+":"+msg.sender+":"+msg.messageId).digest("hex").slice(0,40);
    if(await json<Item|null>(path.join(projectDir(projectId),id+".json"),null)||await json<Job|null>(jobPath(id),null))return {duplicate:true};
    const jobs=await listJobs();
    if(jobs.length>=200)throw Error("Fila de mídia cheia.");
    await write(jobPath(id),{id,projectId,rule,msg,attempts:0,nextAt:Date.now(),state:"pending"} satisfies Job);
    return {queued:true};
  });
}
async function processJob(job:Job){
    const {id,projectId,msg}=job;
    const file=path.join(projectDir(projectId),id+".json");
    if(await json<Item|null>(file,null))return true;
    // A crash after finalizing an original but before publishing the inbox
    // should not require downloading the same WhatsApp message again.
    const stored=await getAssetRecord(projectId,id);
    if(stored){
      return exclusive(async()=>{
        if(!sameRule((await rules())[projectId],job.rule))return false;
        await write(file,{id,name:stored.name,mimeType:stored.mimeType,size:stored.size,receivedAt:stored.verifiedAt});
        return true;
      });
    }
    const existing=await items(projectId);
    if(existing.length>=1000||existing.reduce((sum,x)=>sum+x.size,0)>=MAX_INBOX_BYTES)throw Error("Limite da caixa de entrada.");
    const h=await host();
    const spool=await mkdtemp(path.join(root,"download-"));
    try{
    const target=path.join(spool,"media");
    const res=await evoResponse("/chat/getBase64FromMediaMessage/"+INSTANCE,h,{message:{key:msg.key,message:msg.message},convertToMp4:false});
    const media=await decodeMediaResponse(res,target,Math.min(maxMediaBytes(),MAX_INBOX_BYTES-existing.reduce((sum,x)=>sum+x.size,0)));
    const mime=media.mimeType?.split(";")[0].toLowerCase()||msg.mime;
    if(!Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS,mime))throw Error("Tipo de mídia não suportado.");
    const size=media.size;
    const type=mime.split("/")[0];
    const name="WhatsApp-"+new Date(msg.timestamp).toISOString().replace(/[:.]/g,"-")+"-"+id.slice(-6)+"."+MIME_EXTENSIONS[mime];
    return exclusive(async()=>{
    if(!sameRule((await rules())[projectId],job.rule)||!await readProject(projectId))return false;
    const hashes:string[]=[];
    const handle=await open(target,"r");
    try{
      for(let offset=0;offset<size;offset+=4*1024*1024){
        const chunk=new Uint8Array(Math.min(4*1024*1024,size-offset));
        let n=0;
        while(n<chunk.length){const result=await handle.read(chunk,n,chunk.length-n,offset+n);if(!result.bytesRead)throw Error("Arquivo temporário incompleto.");n+=result.bytesRead;}
        const hash=createHash("sha256").update(chunk).digest("hex");hashes.push(hash);
        await storeChunk(projectId,id,hashes.length-1,chunk.buffer,hash);
      }
    }finally{await handle.close();}
    await finalizeAsset({projectId,assetId:id,name,type,mimeType:mime,size,parts:hashes.length,chunkSha256:hashes});
    await write(file,{id,name,mimeType:mime,size,receivedAt:new Date().toISOString()});
    return true;
    });
    }finally{await rm(spool,{recursive:true,force:true});}
}
export async function work(){
  if(globalLock.cutEditorEvolutionWorking)return {processed:false,busy:true};
  globalLock.cutEditorEvolutionWorking=true;
  try{
    // Single host worker: remove incomplete spool directories left by a restart.
    const names=await readdir(root).catch((e:NodeJS.ErrnoException)=>{if(e.code==="ENOENT")return [];throw e;});
    for(const name of names.filter(n=>/^download-[a-zA-Z0-9]{6}$/.test(n)))await rm(path.join(root,name),{recursive:true,force:true});
    const job=await exclusive(async()=>{
      const jobs=await listJobs();
      return jobs.filter(j=>j.state==="pending"&&j.nextAt<=Date.now()).sort((a,b)=>a.nextAt-b.nextAt)[0];
    });
    if(!job)return {processed:false};
    const file=jobPath(job.id);
    if(!sameRule((await rules())[job.projectId],job.rule)||!await readProject(job.projectId)){
      await exclusive(()=>rm(file,{force:true}));return {processed:true,ignored:true};
    }
    try{
      const received=await processJob(job);
      await exclusive(()=>rm(file,{force:true}));
      return {processed:true,received};
    }catch{
      const attempts=job.attempts+1;
      await exclusive(async()=>{
        if(!sameRule((await rules())[job.projectId],job.rule)){await rm(file,{force:true});return;}
        await write(file,{...job,attempts,nextAt:Date.now()+Math.min(300_000,5000*2**attempts),state:attempts>=5?"failed":"pending",error:"Falha no download ou validação da mídia."});
      });
      return {processed:true,retry:attempts<5};
    }
  }finally{globalLock.cutEditorEvolutionWorking=false;}
}
export async function retryJob(projectId:string,id:unknown,discard=false){
  if(typeof id!=="string")throw Error("ID inválido.");
  return exclusive(async()=>{
    const file=jobPath(id);const job=await json<Job|null>(file,null);
    if(!job||job.projectId!==projectId||job.state!=="failed")throw Error("Item não encontrado.");
    if(discard){await rm(file,{force:true});return;}
    if(!sameRule((await rules())[projectId],job.rule))throw Error("A regra de recebimento mudou. Solicite o reenvio.");
    await write(file,{...job,state:"pending",attempts:0,nextAt:Date.now(),error:undefined});
  });
}
export async function download(projectId:string,id:string){
  if(!/^wa-[a-f0-9]{40}$/.test(id))return null;
  const item=await json<Item|null>(path.join(projectDir(projectId),id+".json"),null);
  const asset=await getAssetRecord(projectId,id);
  if(!item||!asset||asset.size>MAX_CONFIGURED_MEDIA_BYTES)return null;
  const filePath=assetFilePath(projectId,id);
  if((await stat(filePath)).size!==asset.size)return null;
  return {item,filePath};
}
