import {authorizedWebhook,receive} from "@/modules/evolution/server";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{secret:string}>}){
  const {secret}=await params;
  if(!await authorizedWebhook(secret))return new Response(null,{status:404});
  if(!request.body)return new Response(null,{status:400});
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>512*1024)return new Response(null,{status:413});chunks.push(next.value);}
    const payload:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return Response.json(await receive(payload));
  }catch{return Response.json({error:"Falha ao receber mídia."},{status:503});}
  finally{await reader.cancel().catch(()=>undefined);}
}
