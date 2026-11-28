import {createHash,randomUUID,timingSafeEqual} from "node:crypto";
import {mkdir,readFile,writeFile,rename,readdir,rm} from "node:fs/promises";
import path from "node:path";
import {readProject,storeChunk,finalizeAsset,getAssetRecord,assetFilePath} from "@/lan-sync/server";
import {INSTANCE,MAX_MEDIA_BYTES,MAX_INBOX_BYTES,MIME_EXTENSIONS,incoming,phone,validProject,record} from "./policy";

const root=path.join(process.env.LAN_SYNC_DIR||"/app/lan-sync","modules","evolution");
type Host={state:string;requestId?:string;apiKey?:string;webhookSecret?:string;error?:string};
type Rule={enabled:boolean;sender:string;enabledAt:number};
type Item={id:string;name:string;mimeType:string;size:number;receivedAt:string};
let queue=Promise.resolve();
async function exclusive<T>(fn:()=>Promise<T>):Promise<T>{
  const previous=queue; let release!:()=>void;
  queue=new Promise<void>(r=>{release=r;});
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
async function evo(route:string,h:Host,body?:unknown,limit=1024*1024){
  if(h.state!=="installed"||!h.apiKey)throw Error("Módulo não instalado.");
  const res=await fetch("http://evolution:8080"+route,{method:body===undefined?"GET":"POST",headers:{apikey:h.apiKey,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(route.startsWith("/instance/connectionState/") ? 5000 : 60_000)});
  if(!res.ok){const e=new Error("Evolution API: HTTP "+res.status);e.name=String(res.status);throw e;}
  return boundedJson(res,limit);
}
async function connection(h:Host){
  try{const d=await evo("/instance/connectionState/"+INSTANCE,h);return record(d)&&record(d.instance)&&typeof d.instance.state==="string"?d.instance.state:"unknown";}
  catch{return "unavailable";}
}
export async function status(projectId:string){
  const h=await host();
  const req=await json<{id?:string;createdAt?:number}>(path.join(root,"install.json"),{});
  const pending=req.id && req.id!==h.requestId && Date.now()-Number(req.createdAt)<300_000;
  const config=(await rules())[projectId];
  return {installation:pending?"queued":h.state,error:h.state==="failed"?h.error:null,
    connection:h.state==="installed"?await connection(h):"unavailable",
    enabled:config?.enabled===true,sender:config?.sender??"",items:await items(projectId)};
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
export async function receive(payload:unknown){
  const msg=incoming(payload);if(!msg)return {ignored:true};
  return exclusive(async()=>{
    const all=await rules();
    const targets=Object.entries(all).filter(([,rule])=>rule.enabled&&rule.sender===msg.sender&&msg.timestamp>=Math.floor(rule.enabledAt/1000)*1000&&msg.timestamp<=Date.now()+60_000);
    if(targets.length!==1)return {ignored:true};
    const [projectId]=targets[0];if(!await readProject(projectId))return {ignored:true};
    const id="wa-"+createHash("sha256").update(INSTANCE+":"+msg.sender+":"+msg.messageId).digest("hex").slice(0,40);
    const file=path.join(projectDir(projectId),id+".json");
    if(await json<Item|null>(file,null))return {duplicate:true};
    const existing=await items(projectId);
    if(existing.length>=1000||existing.reduce((sum,x)=>sum+x.size,0)>=MAX_INBOX_BYTES)throw Error("Limite da caixa de entrada.");
    const h=await host();
    const media=await evo("/chat/getBase64FromMediaMessage/"+INSTANCE,h,{message:{key:msg.key,message:msg.message},convertToMp4:msg.mime==="audio/ogg"},Math.ceil(MAX_MEDIA_BYTES*4/3)+65536);
    if(!record(media)||typeof media.base64!=="string"||media.base64.length>Math.ceil(MAX_MEDIA_BYTES*4/3)+4||!/^[A-Za-z0-9+/]+={0,2}$/.test(media.base64))throw Error("Mídia inválida.");
    const mime=typeof media.mimetype==="string"?media.mimetype.split(";")[0].toLowerCase():msg.mime;
    if(!Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS,mime))throw Error("Tipo de mídia não suportado.");
    const bytes=Buffer.from(media.base64,"base64");
    if(!bytes.length||bytes.length>MAX_MEDIA_BYTES||existing.reduce((sum,x)=>sum+x.size,0)+bytes.length>MAX_INBOX_BYTES)throw Error("Limite de mídia.");
    const type=mime.split("/")[0];
    const name="WhatsApp-"+new Date(msg.timestamp).toISOString().replace(/[:.]/g,"-")+"-"+id.slice(-6)+"."+MIME_EXTENSIONS[mime];
    const hashes:string[]=[];
    for(let offset=0;offset<bytes.length;offset+=4*1024*1024){
      const chunk=bytes.subarray(offset,offset+4*1024*1024);
      const hash=createHash("sha256").update(chunk).digest("hex");hashes.push(hash);
      await storeChunk(projectId,id,hashes.length-1,new Uint8Array(chunk).buffer,hash);
    }
    await finalizeAsset({projectId,assetId:id,name,type,mimeType:mime,size:bytes.length,parts:hashes.length,chunkSha256:hashes});
    await write(file,{id,name,mimeType:mime,size:bytes.length,receivedAt:new Date().toISOString()});
    return {received:true};
  });
}
export async function download(projectId:string,id:string){
  if(!/^wa-[a-f0-9]{40}$/.test(id))return null;
  const item=await json<Item|null>(path.join(projectDir(projectId),id+".json"),null);
  const asset=await getAssetRecord(projectId,id);
  if(!item||!asset||asset.size>MAX_MEDIA_BYTES)return null;
  return {item,bytes:await readFile(assetFilePath(projectId,id))};
}
