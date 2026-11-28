import {authorizeSync} from "@/lan-sync/server";
import {validProject,record} from "@/modules/evolution/policy";
import {status,install,pair,configure,download,retryJob} from "@/modules/evolution/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const denied=authorizeSync(request);if(denied)return denied;
  const url=new URL(request.url),projectId=url.searchParams.get("projectId");
  if(!validProject(projectId))return Response.json({error:"Projeto inválido."},{status:400,headers});
  try{
    const id=url.searchParams.get("asset");
    if(id){
      const item=await download(projectId,id);
      if(!item)return Response.json({error:"Mídia não encontrada."},{status:404,headers});
      return new Response(new Uint8Array(item.bytes),{headers:{...headers,"Content-Type":item.item.mimeType,"X-Content-Type-Options":"nosniff","Content-Disposition":"attachment"}});
    }
    return Response.json(await status(projectId),{headers});
  }catch{return Response.json({error:"Falha ao consultar módulo."},{status:503,headers});}
}
export async function POST(request:Request){
  const denied=authorizeSync(request);if(denied)return denied;
  const body:unknown=await request.json().catch(()=>null);
  if(!record(body)||!validProject(body.projectId))return Response.json({error:"Projeto inválido."},{status:400,headers});
  try{
    if(body.action==="install")await install();
    else if(body.action==="pair")return Response.json(await pair(body.number),{headers});
    else if(body.action==="configure"&&typeof body.enabled==="boolean")await configure(body.projectId,body.enabled,body.sender);
    else if(body.action==="retry"||body.action==="discard")await retryJob(body.projectId,body.id,body.action==="discard");
    else return Response.json({error:"Ação inválida."},{status:400,headers});
    return Response.json({ok:true},{headers});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"Falha no módulo."},{status:409,headers});}
}
