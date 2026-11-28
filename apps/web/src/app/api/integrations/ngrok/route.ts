import { authorizeSync } from "@/lan-sync/server";
import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const binary = "/usr/local/bin/ngrok";
const dir = process.env.AUTOMATION_DIR || "/app/automation";
const secretFile = path.join(dir, "ngrok.env");
const configFile = path.join(dir, "ngrok-agent.yml");
const upstream = "http://mcp-http:3101";
const api = "http://127.0.0.1:4040/api/tunnels";
let child: ChildProcess | null = null;
let busy = false;

async function token() {
  try {
    const text = await readFile(secretFile,"utf8");
    const match = /^NGROK_AUTHTOKEN=([A-Za-z0-9_-]+)$/m.exec(text);
    return match?.[1] || "";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return process.env.NGROK_AUTHTOKEN || "";
  }
}
async function persist(value: string) {
  await mkdir(dir,{recursive:true});
  const tmp = secretFile+"."+randomUUID()+".tmp";
  try { await writeFile(tmp,"NGROK_AUTHTOKEN="+value+"\n",{mode:0o600}); await rename(tmp,secretFile); }
  finally { await rm(tmp,{force:true}).catch(()=>{}); }
}
async function launch(value: string, validateOnly: boolean) {
  await access(binary);
  await mkdir(dir,{recursive:true});
  await writeFile(configFile,"version: 3\nagent:\n  web_addr: 127.0.0.1:4040\n",{mode:0o600});
  const args = validateOnly ? ["start","--none"] : ["http",upstream,"--inspect=false"];
  const p = spawn(binary,[...args,"--config",configFile,"--log=stdout","--log-format=json"],{
    env:{NODE_ENV:"production",PATH:process.env.PATH || "/usr/local/bin:/usr/bin:/bin",HOME:"/tmp",NGROK_AUTHTOKEN:value},
    stdio:["ignore","pipe","pipe"],
  });
  return p;
}
function waitForSession(p: ChildProcess) {
  return new Promise<void>((resolve,reject)=>{
    let tail = "";
    const timer = setTimeout(()=>finish(Error("Não foi possível confirmar a sessão ngrok em 20s. Confira a rede e o authtoken.")),20000);
    const finish = (error?: Error) => {
      clearTimeout(timer); p.stdout?.off("data",onData); p.stderr?.off("data",onData); p.off("exit",onExit); p.off("error",onError);
      if(error) reject(error); else resolve();
    };
    const onData = (data: Buffer) => {
      tail = (tail+data.toString()).slice(-8192);
      if (/client session established|tunnel session started/i.test(tail)) finish();
      else if (/ERR_NGROK_\d+/.test(tail)) finish(Error("Autenticação ngrok recusada ou sessão indisponível ("+(tail.match(/ERR_NGROK_\d+/)?.[0] || "erro")+")."));
    };
    const onExit = () => finish(Error("Agente ngrok encerrou antes de autenticar."));
    const onError = () => finish(Error("Não foi possível iniciar o agente ngrok."));
    p.stdout?.on("data",onData); p.stderr?.on("data",onData); p.once("exit",onExit); p.once("error",onError);
  });
}
async function endpoint() {
  try {
    const response = await fetch(api,{cache:"no-store",signal:AbortSignal.timeout(2500)});
    if (!response.ok) return null;
    const data = await response.json() as {tunnels?:Array<{public_url?:string;config?:{addr?:string}}>};
    const tunnel = data.tunnels?.find(t=>t.public_url?.startsWith("https://") && t.config?.addr?.replace(/\/$/,"")===upstream);
    return tunnel?.public_url || null;
  } catch { return null; }
}
async function status() {
  const available=await access(binary).then(()=>true,()=>false);
  return {agentAvailable:available,configured:Boolean(await token()),active:Boolean(await endpoint()),url:await endpoint(),busy};
}
export async function GET(request: Request) {
  const denied=authorizeSync(request);if(denied)return denied;
  try {
    const info = await status();
    if (new URL(request.url).searchParams.get("connection") === "1") {
      const secret = process.env.OPENCUT_AUTOMATION_TOKEN || "";
      if (!info.active || !info.url || secret.length < 16) return Response.json({error:"Ative o túnel e configure a autenticação do MCP."},{status:409,headers:{"Cache-Control":"no-store"}});
      const accessToken = createHmac("sha256", secret).update("cut-editor:mcp-external:v1").digest("hex");
      return Response.json({...info, endpoint: info.url.replace(/\/$/, "") + "/mcp", accessToken},{headers:{"Cache-Control":"no-store"}});
    }
    return Response.json(info,{headers:{"Cache-Control":"no-store"}});
  }
  catch{return Response.json({error:"Não foi possível consultar o agente."},{status:500});}
}
export async function PUT(request: Request) {
  const denied=authorizeSync(request);if(denied)return denied;
  if(busy || child || await endpoint())return Response.json({error:"Desative o túnel antes de alterar a chave."},{status:409});
  const body=await request.json().catch(()=>null) as {token?:unknown}|null;
  const value=typeof body?.token==="string"?body.token.trim():"";
  if(!/^[A-Za-z0-9_-]{16,512}$/.test(value))return Response.json({error:"Informe o authtoken do agente ngrok, não uma API Key REST."},{status:400});
  busy=true;let probe:ChildProcess|null=null;
  try {
    probe=await launch(value,true);await waitForSession(probe);
    await persist(value);
    return Response.json({agentAvailable:true,configured:true,active:false,url:null,validated:true});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Falha na validação."},{status:502});}
  finally {probe?.kill("SIGTERM");busy=false;}
}
export async function POST(request: Request) {
  const denied=authorizeSync(request);if(denied)return denied;
  if(busy)return Response.json({error:"Agente ocupado."},{status:409});
  const current=await endpoint();if(current)return Response.json({active:true,url:current});
  const value=await token();if(!value)return Response.json({error:"Salve e valide o authtoken primeiro."},{status:400});
  busy=true;
  try {
    if(child) {child.kill("SIGTERM");child=null;}
    const p=await launch(value,false);child=p;
    p.once("exit",()=>{if(child===p)child=null;});
    p.on("error",()=>{if(child===p)child=null;});
    await waitForSession(p);
    // Drain logs without persisting credentials or tunnel traffic.
    p.stdout?.resume();p.stderr?.resume();
    for(let i=0;i<20;i++){
      const url=await endpoint();if(url)return Response.json({agentAvailable:true,configured:true,active:true,url});
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    throw Error("Sessão autenticada, mas o túnel MCP não apareceu.");
  }catch(error){child?.kill("SIGTERM");child=null;return Response.json({error:error instanceof Error?error.message:"Falha ao ativar túnel."},{status:502});}
  finally{busy=false;}
}
export async function DELETE(request: Request) {
  const denied=authorizeSync(request);if(denied)return denied;
  if(busy)return Response.json({error:"Agente ocupado."},{status:409});
  child?.kill("SIGTERM");child=null;
  for(let i=0;i<10;i++){if(!await endpoint())return Response.json({active:false});await new Promise(resolve=>setTimeout(resolve,300));}
  return Response.json({error:"O agente não encerrou. Reinicie o web para desativar o túnel."},{status:502});
}
