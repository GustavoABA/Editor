import {describe,expect,test} from "bun:test";
import {incoming,phone,validProject,MAX_MEDIA_BYTES,mediaLimit,needsEditingProxy} from "./policy";
const example=()=>({instance:"cut-editor",event:"messages.upsert",data:{key:{remoteJid:"5511999999999@s.whatsapp.net",fromMe:false,id:"ABC123"},messageTimestamp:1700000000,message:{audioMessage:{mimetype:"audio/ogg; codecs=opus",fileLength:123}}}});
describe("Evolution inbound policy",()=>{
  test("bounds configurable media limits and selects editing proxies",()=>{
    expect(mediaLimit(undefined)).toBe(MAX_MEDIA_BYTES);
    expect(mediaLimit("128")).toBe(128*1024*1024);
    expect(mediaLimit("129")).toBe(MAX_MEDIA_BYTES);
    expect(mediaLimit("0")).toBe(MAX_MEDIA_BYTES);
    expect(needsEditingProxy("audio/ogg",123)).toBe(true);
    expect(needsEditingProxy("video/mp4",32*1024*1024)).toBe(true);
    expect(needsEditingProxy("image/png",123)).toBe(false);
    expect(needsEditingProxy("image/gif",32*1024*1024)).toBe(false);
    const p=example();
    const big={...p,data:{...p.data,message:{videoMessage:{mimetype:"video/mp4",fileLength:64*1024*1024}}}};
    expect(incoming(big)).toBeNull();
    expect(incoming(big,mediaLimit("128"))?.mime).toBe("video/mp4");
  });
  test("normalizes international numbers",()=>{
    expect(phone("+55 (11) 99999-9999")).toBe("5511999999999");
    expect(phone("invalid")).toBeNull();
    expect(phone("00000000")).toBeNull();
  });
  test("accepts audio only from direct sender and retains timestamp",()=>{
    expect(incoming(example())).toMatchObject({sender:"5511999999999",mime:"audio/ogg",timestamp:1700000000000,messageId:"ABC123"});
  });
  test("ignores text, outgoing, groups, history and other instance",()=>{
    const p=example();
    expect(incoming({...p,data:{...p.data,message:{conversation:"hello"}}})).toBeNull();
    expect(incoming({...p,data:{...p.data,key:{...p.data.key,fromMe:true}}})).toBeNull();
    expect(incoming({...p,data:{...p.data,key:{...p.data.key,remoteJid:"123@g.us"}}})).toBeNull();
    expect(incoming({...p,event:"messages.set"})).toBeNull();
    expect(incoming({...p,instance:"other"})).toBeNull();
  });
  test("resolves only explicitly supplied alternate phone JID",()=>{
    const p=example();
    expect(incoming({...p,data:{...p.data,key:{...p.data.key,remoteJid:"123@lid"}}})).toBeNull();
    expect(incoming({...p,data:{...p.data,key:{...p.data.key,remoteJid:"123@lid",remoteJidAlt:"5511999999999@s.whatsapp.net"}}})?.sender).toBe("5511999999999");
  });
  test("rejects executable and oversized media, invalid project IDs",()=>{
    const p=example();
    expect(incoming({...p,data:{...p.data,message:{documentMessage:{mimetype:"application/x-msdownload"}}}})).toBeNull();
    expect(incoming({...p,data:{...p.data,message:{audioMessage:{mimetype:"audio/ogg",fileLength:MAX_MEDIA_BYTES+1}}}})).toBeNull();
    expect(validProject("../secret")).toBe(false);
    expect(validProject("__proto__")).toBe(false);
  });
});
