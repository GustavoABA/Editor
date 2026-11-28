import {open,rm} from "node:fs/promises";
import {record} from "./policy";

// Evolution returns JSON containing a top-level base64 string. Decode that field
// directly to a private disk file; only small surrounding JSON metadata stays in RAM.
// Fail closed for malformed JSON, multiple base64 fields, escapes in base64,
// noncanonical padding or a response beyond the configured limits.
export async function decodeMediaResponse(response:Response,target:string,maxBytes:number){
  if(!response.body)throw Error("Resposta de mídia vazia.");
  const handle=await open(target,"wx",0o600);
  const reader=response.body.getReader();
  const decoder=new TextDecoder("utf-8",{fatal:true});
  let meta="", depth=0, inString=false, escaped=false, keyCandidate=false;
  let keyText="", significant="", waiting:"colon"|"quote"|null=null;
  let decoding=false, found=false, carry="", padded=false, size=0, wire=0;
  const MAX_META=65536;
  const maxWire=Math.ceil(maxBytes/3)*4+MAX_META;
  function add(text:string){
    meta+=text;
    if(meta.length>MAX_META)throw Error("Metadados da mídia acima do limite.");
  }
  async function decode(text:string,final=false){
    if(!/^[A-Za-z0-9+/=]*$/.test(text)||padded&&text.length)throw Error("Base64 inválido.");
    const all=carry+text;
    const length=final?all.length:all.length-all.length%4;
    const part=all.slice(0,length);
    carry=all.slice(length);
    if(final&&length%4!==0)throw Error("Base64 incompleto.");
    if(!part)return;
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(part))throw Error("Padding base64 inválido.");
    const bytes=Buffer.from(part,"base64");
    if(bytes.toString("base64")!==part)throw Error("Base64 não canônico.");
    if(part.includes("=")){padded=true;if(carry)throw Error("Padding prematuro.");}
    if(size+bytes.length>maxBytes)throw Error("Arquivo acima do limite.");
    let offset=0;
    while(offset<bytes.length){
      const result=await handle.write(bytes,offset,bytes.length-offset,size+offset);
      if(!result.bytesWritten)throw Error("Falha ao gravar mídia.");
      offset+=result.bytesWritten;
    }
    size+=bytes.length;
  }
  async function feed(text:string){
    let i=0;
    while(i<text.length){
      if(decoding){
        const end=text.indexOf('"',i);
        const stop=end===-1?text.length:end;
        // Network chunks can be arbitrarily large; decode only bounded slices.
        while(i<stop){
          const next=Math.min(stop,i+65536);
          await decode(text.slice(i,next));i=next;
        }
        if(end===-1)continue;
        await decode("",true);
        if(carry||!size)throw Error("Mídia vazia ou incompleta.");
        add('"');decoding=false;significant='"';i++;continue;
      }
      const ch=text[i++];
      add(ch);
      if(waiting){
        if(/\s/.test(ch))continue;
        if(waiting==="colon"&&ch===":"){waiting="quote";significant=ch;continue;}
        if(waiting==="quote"&&ch==='"'){
          if(found)throw Error("Campo base64 duplicado.");
          found=true;decoding=true;waiting=null;continue;
        }
        throw Error("Formato de mídia inválido.");
      }
      if(inString){
        if(keyCandidate)keyText+=ch;
        if(escaped){escaped=false;continue;}
        if(ch==="\\"){escaped=true;continue;}
        if(ch==='"'){
          inString=false;
          if(keyCandidate&&JSON.parse('"'+keyText)==="base64")waiting="colon";
          keyCandidate=false;keyText="";significant='"';
        }
        continue;
      }
      if(ch==='"'){
        inString=true;keyCandidate=depth===1&&(significant==="{"||significant===",");
        keyText="";
      }else if(ch==="{"||ch==="[")depth++;
      else if(ch==="}"||ch==="]")depth--;
      if(!/\s/.test(ch))significant=ch;
    }
  }
  let ok=false;
  try{
    while(true){
      const result=await reader.read();if(result.done)break;
      wire+=result.value.byteLength;if(wire>maxWire)throw Error("Resposta acima do limite.");
      await feed(decoder.decode(result.value,{stream:true}));
    }
    await feed(decoder.decode());
    if(!found||decoding||inString||waiting||depth!==0||size===0)throw Error("Resposta de mídia incompleta.");
    const data:unknown=JSON.parse(meta);
    if(!record(data)||data.base64!=="")throw Error("Resposta de mídia inválida.");
    await handle.sync();ok=true;
    return {size,mimeType:typeof data.mimetype==="string"?data.mimetype:undefined};
  }finally{
    await reader.cancel().catch(()=>undefined);
    await handle.close();
    if(!ok)await rm(target,{force:true});
  }
}
