import {authorizeAutomationRequest} from "@/server-automation/auth";
import {work} from "@/modules/evolution/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
export async function POST(request:Request){
  const auth=authorizeAutomationRequest({request});
  if(!auth.ok)return Response.json({error:auth.error},{status:auth.status});
  try{return Response.json(await work(),{headers:{"Cache-Control":"no-store"}});}
  catch{return Response.json({error:"Falha na fila de mídias."},{status:503});}
}
