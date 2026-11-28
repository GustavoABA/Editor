import {describe,expect,test} from "bun:test";
import {incoming,phone,validProject,MAX_MEDIA_BYTES} from "./policy";
const example=()=>({instance:"cut-editor",event:"messages.upsert",data:{key:{remoteJid:"5511999999999@s.whatsapp.net",fromMe:false,id:"ABC123"},messageTimestamp:1700000000,message:{audioMessage:{mimetype:"audio/ogg; codecs=opus",fileLength:123}}}});
describe("Evolution inbound policy",()=>{
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
