import {describe,expect,test} from "bun:test";
import {mkdtemp,readFile,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {decodeMediaResponse} from "./media-stream";

function response(parts:Iterable<string>){
  const iterator=parts[Symbol.iterator]();
  const encoder=new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller){
      const next=iterator.next();
      if(next.done)controller.close();else controller.enqueue(encoder.encode(next.value));
    }
  }));
}
async function withTarget(fn:(target:string)=>Promise<void>){
  const dir=await mkdtemp(path.join(tmpdir(),"wa-stream-"));
  try{await fn(path.join(dir,"original"));}finally{await rm(dir,{recursive:true,force:true});}
}

describe("Evolution incremental media decoder",()=>{
  test("handles arbitrary chunk boundaries, nested metadata and padding",async()=>{
    const bytes=Buffer.from([0,1,2,253,254,255,17]);
    const json=JSON.stringify({nested:{base64:"not the media"},base64:bytes.toString("base64"),mimetype:"audio/ogg",label:'say "hello"'});
    await withTarget(async target=>{
      const result=await decodeMediaResponse(response(json),target,100);
      expect(result).toEqual({size:bytes.length,mimeType:"audio/ogg"});
      expect(await readFile(target)).toEqual(bytes);
    });
  });
  test("rejects invalid, duplicate, truncated and over-limit fields; removes partial files",async()=>{
    for(const json of [
      '{"base64":"A==="}','{"base64":"AB=="}','{"base64":"AAAA","base64":"AAAA"}',
      '{"base64":"AAAA','{"base64":123}','{"nested":{"base64":"AAAA"}}',
      '{"base64":"AA==AAAA"}','{"base64":"AAAA"} trailing','{"base64":"AAAAAAA="}'
    ]){
      await withTarget(async target=>{
        await expect(decodeMediaResponse(response(json),target,4)).rejects.toThrow();
        await expect(stat(target)).rejects.toThrow();
      });
    }
  });
  test("streams a 33 MiB file without constructing its complete encoded string",async()=>{
    const bytes=33*1024*1024;
    function* data(){
      yield '{"mimetype":"video/mp4","base64":"';
      const piece="A".repeat(65536);
      for(let remaining=bytes/3*4;remaining>0;remaining-=piece.length)yield piece.slice(0,remaining);
      yield '"}';
    }
    await withTarget(async target=>{
      const result=await decodeMediaResponse(response(data()),target,64*1024*1024);
      expect(result.size).toBe(bytes);
      expect((await stat(target)).size).toBe(bytes);
    });
  },30000);
  test("rejects excessive metadata and invalid padding across chunks",async()=>{
    await withTarget(async target=>{
      await expect(decodeMediaResponse(response(['{"label":"',"a".repeat(70000),'","base64":"AAAA"}']),target,100)).rejects.toThrow();
      await expect(stat(target)).rejects.toThrow();
    });
    await withTarget(async target=>{
      await expect(decodeMediaResponse(response(['{"base64":"AA==','AAAA"}']),target,100)).rejects.toThrow();
    });
  });
});
