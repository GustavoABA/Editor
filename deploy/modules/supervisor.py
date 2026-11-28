#!/usr/bin/env python3
"""Fixed-catalog host worker. No web-provided Docker commands or image names."""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"deploy/mobile"))
import updater
STATE=updater.STATE/"modules"
ENV=STATE/"evolution.env"
MODULE=ROOT/"deploy/modules/evolution/compose.yml"
CATALOG=ROOT/"deploy/modules/catalog.json"
BASE="/app/lan-sync/modules/evolution"
READ_SCRIPT="const fs=require('node:fs');try{console.log(fs.readFileSync('"+BASE+"/install.json','utf8'))}catch(e){if(e.code==='ENOENT')console.log('{}');else throw e}"
WRITE_SCRIPT="const fs=require('node:fs');const p='"+BASE+"';fs.mkdirSync(p,{recursive:true});const d=JSON.parse(fs.readFileSync(0,'utf8'));const f=p+'/host.json';fs.writeFileSync(f+'.tmp',JSON.stringify(d),{mode:384});fs.renameSync(f+'.tmp',f)"
def run(*args,capture=False,input=None,timeout=1800):
    return subprocess.run(args,cwd=ROOT,check=True,text=True,input=input,
                          stdout=subprocess.PIPE if capture else None,timeout=timeout).stdout
def web(*args,**kwargs):
    # Compose project name remains the same, and exec never recreates web.
    return run("docker","compose","exec","-T","web","node","-e",*args,**kwargs)
def publish(state,**extra):
    web(WRITE_SCRIPT,input=json.dumps({"state":state,**extra}),timeout=20)
def approved_images():
    catalog=json.loads(CATALOG.read_text())["modules"][0]["images"]
    result={}
    platform=updater.docker_platform()
    for key,tag in catalog.items():
        # Fixed repository/tag from the checked-in catalog, never the request.
        run("docker","pull","--platform",platform,tag)
        info=json.loads(run("docker","image","inspect",tag,capture=True,timeout=30))[0]
        if info.get("Os")+"/"+info.get("Architecture")!=platform:
            raise RuntimeError("Architecture mismatch")
        repo=tag.rsplit(":",1)[0]
        matches=[d for d in info.get("RepoDigests",[]) if re.fullmatch(re.escape(repo)+r"@sha256:[a-f0-9]{64}",d)]
        if len(matches)!=1: raise RuntimeError("Could not pin image digest")
        result[key]=matches[0]
    return result
def config():
    if ENV.exists():
        data=dict(line.split("=",1) for line in ENV.read_text().splitlines())
        if any(not re.fullmatch(r"[a-f0-9]{64}",data.get(k,"")) for k in ("EVOLUTION_KEY","EVOLUTION_DB_PASSWORD","WEBHOOK_SECRET")):
            raise ValueError("Invalid module secrets")
        for k in ("EVOLUTION_IMAGE","EVOLUTION_DB_IMAGE","EVOLUTION_REDIS_IMAGE"):
            if not re.fullmatch(r"[a-z0-9./_-]+@sha256:[a-f0-9]{64}",data.get(k,"")): raise ValueError("Invalid image pin")
        return data
    data=approved_images()
    data.update({k:secrets.token_hex(32) for k in ("EVOLUTION_KEY","EVOLUTION_DB_PASSWORD","WEBHOOK_SECRET")})
    fd=os.open(ENV,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w") as f:
        f.write("".join(k+"="+v+"\n" for k,v in data.items()))
        f.flush()
        os.fsync(f.fileno())
    return data
def install(request_id):
    STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
    publish("installing",requestId=request_id)
    data=config()
    cmd=["docker","compose","--project-name","cut-editor-evolution","--env-file",str(ENV),"-f",str(MODULE)]
    run(*cmd,"up","-d","--no-build","--pull","never","--wait","--wait-timeout","180",timeout=240)
    # Validate API authentication from the same network that the editor uses.
    script="const fs=require('node:fs');const key=fs.readFileSync(0,'utf8');fetch('http://evolution:8080/instance/fetchInstances',{headers:{apikey:key},signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    for _ in range(30):
        try:
            web(script,input=data["EVOLUTION_KEY"],timeout=10)
            break
        except subprocess.SubprocessError: time.sleep(3)
    else: raise RuntimeError("Evolution API not ready")
    publish("installed",requestId=request_id,apiKey=data["EVOLUTION_KEY"],webhookSecret=data["WEBHOOK_SECRET"])
def tick():
    with updater.lock():
        if updater.JOURNAL.exists(): return
        request=json.loads(web(READ_SCRIPT,capture=True,timeout=20))
        if not isinstance(request,dict): return
        rid=request.get("id")
        if request.get("action")!="install" or not isinstance(rid,str) or not re.fullmatch(r"[a-f0-9-]{36}",rid): return
        STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
        last=STATE/"last-request.json"
        if last.exists() and json.loads(last.read_text()).get("id")==rid: return
        try:
            install(rid)
        except (RuntimeError,ValueError,OSError,subprocess.SubprocessError) as e:
            publish("failed",requestId=rid,error=type(e).__name__)
        updater.write(last,{"id":rid})
if __name__=="__main__":
    try: tick()
    except (RuntimeError,ValueError,OSError,subprocess.SubprocessError) as e:
        print("Module supervisor:",type(e).__name__,file=sys.stderr)
        sys.exit(1)
