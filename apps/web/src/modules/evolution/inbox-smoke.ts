// Run standalone: bun run src/modules/evolution/inbox-smoke.ts
// Uses isolated storage and mocked Evolution HTTP, not a real WhatsApp account.
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,rm,readFile,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
const root=await mkdtemp(path.join(tmpdir(),"cut-editor-wa-"));
const originalFetch=globalThis.fetch;
const oldDir=process.env.LAN_SYNC_DIR;
process.env.LAN_SYNC_DIR=root;
try{
  const api=await import("./server");
  const storage=await import("@/lan-sync/server");
  const dir=path.join(root,"modules","evolution");
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,"host.json"),JSON.stringify({state:"installed",apiKey:"a".repeat(64),webhookSecret:"b".repeat(64)}));
  await storage.saveProject({projectId:"project-a",baseRevision:0,document:{metadata:{id:"project-a",name:"Test"},scenes:[]},assets:[]});
  await storage.saveProject({projectId:"project-b",baseRevision:0,document:{metadata:{id:"project-b",name:"Test B"},scenes:[]},assets:[]});
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR42mNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==","base64");
  let fail=false;
  globalThis.fetch=Object.assign(async(input:RequestInfo|URL)=>{
    const url=String(input);
    if(url.includes("/instance/connectionState/"))return Response.json({instance:{state:"open"}});
    if(url.includes("/chat/getBase64FromMediaMessage/"))return fail?new Response(null,{status:503}):Response.json({base64:png.toString("base64"),mimetype:"image/png"});
    throw Error("Unexpected URL");
  },{preconnect:originalFetch.preconnect}) as typeof fetch;
  const payload=(id:string,sender="5511999999999")=>({instance:"cut-editor",event:"messages.upsert",data:{key:{id,remoteJid:sender+"@s.whatsapp.net",fromMe:false},messageTimestamp:Math.floor(Date.now()/1000),message:{imageMessage:{mimetype:"image/png"}}}});
  await api.configure("project-a",true,"5511999999999");
  await assert.rejects(api.configure("project-b",true,"5511999999999"));
  await api.configure("project-b",true,"5511888888888");
  assert.deepEqual(await api.receive(payload("unauthorized","5511777777777")),{ignored:true});
  assert.deepEqual(await api.receive(payload("first")),{queued:true});
  assert.deepEqual(await api.receive(payload("first")),{duplicate:true});
  assert.equal((await api.status("project-a")).items.length,0);
  assert.equal((await api.status("project-a")).queue.length,1);
  assert.equal((await api.work()).received,true);
  const received=(await api.status("project-a")).items[0];
  assert.equal(received.mimeType,"image/png");
  assert.deepEqual((await api.download("project-a",received.id))?.bytes,png);
  assert.equal((await api.status("project-b")).items.length,0);
  assert.deepEqual(await api.receive(payload("first")),{duplicate:true});
  await api.receive(payload("cancelled"));
  await api.configure("project-a",false,null);
  assert.equal((await api.work()).ignored,true);
  assert.equal((await api.status("project-a")).items.length,1);
  assert.deepEqual(await api.receive(payload("disabled")),{ignored:true});
  await api.receive(payload("retry","5511888888888"));
  fail=true;
  for(let attempt=0;attempt<5;attempt++){
    const files=await readdir(path.join(dir,"queue"));
    const file=path.join(dir,"queue",files[0]);
    const job=JSON.parse(await readFile(file,"utf8"));job.nextAt=0;
    await writeFile(file,JSON.stringify(job));
    await api.work();
  }
  const failed=(await api.status("project-b")).queue[0];
  assert.equal(failed.state,"failed");
  assert.equal(failed.attempts,5);
  await api.retryJob("project-b",failed.id);
  fail=false;
  assert.equal((await api.work()).received,true);
  assert.equal((await api.status("project-b")).items.length,1);
  console.log("Evolution inbox smoke passed: project routing, dedupe, persistence, disable and retry.");
}finally{
  globalThis.fetch=originalFetch;
  if(oldDir===undefined)delete process.env.LAN_SYNC_DIR;else process.env.LAN_SYNC_DIR=oldDir;
  await rm(root,{recursive:true,force:true});
}
