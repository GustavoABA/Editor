#!/usr/bin/env python3
"""Offline backup of Compose-owned volumes and configuration. Does not restore."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

import updater

REQUIRED = {"postgres_data","lan_sync_data","automation_data","render_jobs_v2","caddy_data","caddy_config"}
CONFIGS = (".env","docker-compose.yml","Caddyfile","deploy/mobile/compose.lite.yml")
SAFE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,180}")

def safe_name(value):
    if not isinstance(value,str) or not SAFE.fullmatch(value):
        raise ValueError("Nome de volume/arquivo inválido.")
    return value

def verify_receipt(receipt):
    if not receipt.is_file():
        raise ValueError("Recibo de backup ausente.")
    data=updater.read(receipt)
    if data.get("schema")!=1 or data.get("complete") is not True:
        raise ValueError("Backup não concluído.")
    files=data.get("files")
    if not isinstance(files,dict) or not files:
        raise ValueError("Backup sem arquivos.")
    for name,expected in files.items():
        p=receipt.parent/safe_name(name)
        if p.is_symlink() or not p.is_file() or updater.digest(p)!=expected:
            raise ValueError("Backup ausente ou corrompido: "+name)
    volumes=data.get("volumes")
    if not isinstance(volumes,dict) or not REQUIRED.issubset(volumes):
        raise ValueError("Volumes essenciais ausentes do backup.")
    if any(name not in files for name in volumes.values()):
        raise ValueError("Arquivo de volume não registrado.")
    if not {"config-env","config-docker-compose.yml","config-Caddyfile","config-compose.lite.yml"}.issubset(files):
        raise ValueError("Configuração incompleta.")
    return data

def backup(destination,lite):
    if updater.JOURNAL.exists():
        raise RuntimeError("Recupere a transação anterior antes do backup.")
    args=updater.compose(lite,updater.active_override(lite))
    config=json.loads(updater.run(*args,"config","--format","json",capture=True,timeout=30))
    project=safe_name(config["name"])
    if updater.run("docker","ps","-q","--filter","label=com.docker.compose.project="+project,capture=True,timeout=30).strip():
        raise RuntimeError("Pare todos os containers do projeto antes do backup offline.")
    db_ids=updater.run(*args,"ps","-a","-q","db",capture=True,timeout=30).split()
    if len(db_ids)!=1:
        raise RuntimeError("Container DB existente necessário para usar seu tar local.")
    helper=json.loads(updater.run("docker","inspect",db_ids[0],capture=True,timeout=30))[0]["Image"]
    if not re.fullmatch(r"sha256:[0-9a-f]{64}",helper):
        raise ValueError("Imagem auxiliar inválida.")
    existing=set(updater.run("docker","volume","ls","-q",capture=True,timeout=30).split())
    volumes={}
    for logical,definition in config["volumes"].items():
        name=safe_name(definition["name"])
        if name not in existing:
            continue
        info=json.loads(updater.run("docker","volume","inspect",name,capture=True,timeout=30))[0]
        if (info.get("Labels") or {}).get("com.docker.compose.project")!=project:
            raise RuntimeError("Volume não pertence ao projeto: "+name)
        if updater.run("docker","ps","-q","--filter","volume="+name,capture=True,timeout=30).strip():
            raise RuntimeError("Volume ainda em uso: "+name)
        volumes[safe_name(logical)]=name
    if not REQUIRED.issubset(volumes):
        raise RuntimeError("Volumes essenciais ausentes. Verifique instalação e nome Compose.")
    # Fresh, private directory; do not overwrite a previous backup.
    destination.mkdir(mode=0o700,parents=False,exist_ok=False)
    files,archives={},{}
    for name in CONFIGS:
        target=destination/("config-env" if name==".env" else "config-"+Path(name).name)
        shutil.copyfile(updater.ROOT/name,target)
        target.chmod(0o600)
        files[target.name]=updater.digest(target)
    for logical,volume in volumes.items():
        target=destination/("volume-"+logical+".tar")
        print("Arquivando:",logical,flush=True)
        with target.open("xb") as output:
            target.chmod(0o600)
            subprocess.run(["docker","run","--rm","--pull","never","--network","none",
                "--read-only","--user","0:0","--entrypoint","tar",
                "--mount","type=volume,src="+volume+",dst=/backup,readonly",
                helper,"-C","/backup","-cf","-","."],stdout=output,check=True,timeout=14400)
            output.flush()
            os.fsync(output.fileno())
        # Check that the archive can be read completely before recording it.
        subprocess.run(["tar","-tf",str(target)],stdout=subprocess.DEVNULL,check=True,timeout=14400)
        files[target.name]=updater.digest(target)
        archives[logical]=target.name
    receipt=destination/"receipt.json"
    updater.write(receipt,{"schema":1,"complete":True,"project":project,"files":files,"volumes":archives,
        "createdAt":datetime.now(timezone.utc).isoformat()})
    verify_receipt(receipt)
    print("Backup offline criado e hashes verificados:",receipt)
    print("Restauração real ainda deve ser ensaiada em host descartável.")

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("destination",type=Path)
    p.add_argument("--lite",action="store_true")
    p.add_argument("--maintenance-confirmed",action="store_true")
    a=p.parse_args()
    if not a.maintenance_confirmed: p.error("Feche todos os clientes, finalize jobs, sincronize projetos e pare o stack primeiro.")
    with updater.lock():
        backup(a.destination.resolve(),a.lite)

if __name__=="__main__":
    try:
        main()
    except (RuntimeError,ValueError,OSError,subprocess.SubprocessError) as exc:
        print("Backup interrompido:",type(exc).__name__,str(exc),file=sys.stderr)
        sys.exit(1)
