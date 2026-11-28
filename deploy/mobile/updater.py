#!/usr/bin/env python3
"""F13 staged updater. Signed, same-topology releases only; activation is manual."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import quote
from urllib.request import Request, build_opener

import release_monitor as monitor
import status_export

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".cut-editor"
ACTIVE = STATE / "active.json"
JOURNAL = STATE / "transaction.json"
STAGED = STATE / "staged.json"
KEY = STATE / "trusted-release.pem"
MAP = {"web":"web", "local-ai":"local-ai", "parakeet":"parakeet", "mcp-http":"mcp"}
CORE = ["web", "mcp-http"]
HEAVY = ["local-ai", "parakeet"]

def run(*args, capture=False, timeout=1800):
    result = subprocess.run(args, cwd=ROOT, check=True, timeout=timeout,
                            text=True, stdout=subprocess.PIPE if capture else None)
    return result.stdout if capture else None

def read(path):
    return json.loads(path.read_text(encoding="utf-8"))

def write(path, data):
    monitor.save_state(path, data)

def now():
    return datetime.now(timezone.utc).isoformat()

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024*1024), b""):
            h.update(block)
    return h.hexdigest()

@contextmanager
def lock():
    STATE.mkdir(mode=0o700, exist_ok=True)
    with (STATE / "update.lock").open("a") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Outra operação do atualizador está em andamento.") from None
        yield

def verify(manifest_path, signature_path, key_path=KEY):
    # Verify exact bytes before trusting any manifest fields. The public key is
    # installed locally by the administrator, never downloaded by this script.
    if not key_path.is_file():
        raise RuntimeError("Chave pública de release não instalada.")
    if manifest_path.stat().st_size > 256*1024 or signature_path.stat().st_size > 8192:
        raise ValueError("Manifesto ou assinatura acima do limite.")
    with tempfile.TemporaryDirectory() as d:
        payload = Path(d)/"manifest.json"
        signature = Path(d)/"manifest.sig"
        payload.write_bytes(manifest_path.read_bytes())
        signature.write_bytes(signature_path.read_bytes())
        run("openssl", "dgst", "-sha256", "-verify", str(key_path),
            "-signature", str(signature), str(payload), timeout=15)
        data = monitor.validate_manifest(read(payload))
    if type(data.get("sequence")) is not int or data["sequence"] < 1:
        raise ValueError("Sequência de release ausente ou inválida.")
    if data.get("rollbackSafe") is not True or not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", str(data.get("dataSchema",""))):
        raise ValueError("Release não declarada compatível para rollback de imagens.")
    for path, expected in data["files"].items():
        if digest(ROOT/path) != expected:
            raise ValueError("Topologia/configuração mudou: atualize o pacote Compose manualmente: " + path)
    return data

def selected(lite):
    return CORE if lite else CORE + HEAVY

def compose(lite, override=None):
    args = ["docker","compose","--project-directory",str(ROOT),"-f",str(ROOT/"docker-compose.yml")]
    if lite:
        args += ["-f",str(ROOT/"deploy/mobile/compose.lite.yml")]
    if override:
        args += ["-f",str(override)]
    return args

def image_override(path, images):
    # JSON is valid Compose YAML. Only fixed services and image values are emitted.
    if not images or not set(images).issubset(MAP):
        raise ValueError("Serviços de atualização inválidos.")
    write(path, {"services":{s:{"image":image} for s,image in images.items()}})

def active_override(lite):
    if JOURNAL.exists():
        raise RuntimeError("Transação interrompida. Execute updater.py recover antes de iniciar o host.")
    if not ACTIVE.exists():
        return None
    state = read(ACTIVE)
    if state.get("lite") != lite:
        raise RuntimeError("Perfil ativo diferente. Não altere perfil durante atualização gerenciada.")
    path = STATE/"active-compose.json"
    if not path.is_file() or digest(path) != state.get("overrideHash"):
        raise RuntimeError("Override ativo ausente ou alterado.")
    return path

def check_sequence(data, current):
    if current and data["sequence"] <= current["sequence"]:
        raise ValueError("Release antiga, repetida ou fora de ordem.")
    if current and data["dataSchema"] != current["dataSchema"]:
        raise ValueError("Migração de dados exige procedimento manual.")

def docker_platform():
    info = json.loads(run("docker","info","--format","{{json .}}",capture=True,timeout=30))
    arch = {"x86_64":"amd64","amd64":"amd64","aarch64":"arm64","arm64":"arm64"}.get(info.get("Architecture"))
    if info.get("OSType") != "linux" or not arch:
        raise RuntimeError("Docker Linux amd64/arm64 necessário.")
    return "linux/" + arch

def stage(manifest, signature, lite):
    if JOURNAL.exists():
        raise RuntimeError("Recupere a transação anterior primeiro.")
    active_override(lite)
    data = verify(manifest, signature)
    check_sequence(data, read(ACTIVE) if ACTIVE.exists() else None)
    platform = docker_platform()
    if platform not in data["platforms"]:
        raise ValueError("Release não suporta a arquitetura do daemon.")
    images = {s:data["images"][MAP[s]] for s in selected(lite)}
    for image in set(images.values()):
        run("docker","pull","--platform",platform,image)
        info = json.loads(run("docker","image","inspect",image,capture=True,timeout=30))[0]
        if info.get("Os")+"/"+info.get("Architecture") != platform or image not in info.get("RepoDigests",[]):
            raise RuntimeError("Digest ou arquitetura local não corresponde à release.")
    # The manifest is reverified at activation; keep exact signed bytes.
    shutil.copyfile(manifest, STATE/"staged-manifest.json")
    shutil.copyfile(signature, STATE/"staged-manifest.sig")
    write(STAGED, {"commit":data["commit"],"sequence":data["sequence"],"lite":lite,
                   "images":images,"stagedAt":now()})
    print("Imagens verificadas e baixadas. Instalação ainda não executada.")

def stage_latest(lite):
    release = monitor.read_json(monitor.API)
    if not isinstance(release,dict) or release.get("draft") or release.get("prerelease"):
        raise ValueError("Nenhuma release pública estável disponível.")
    tag = release.get("tag_name","")
    if not isinstance(tag,str) or not re.fullmatch(monitor.TAG,tag):
        raise ValueError("Tag inválida.")
    names = {a.get("name") for a in release.get("assets",[]) if isinstance(a,dict)}
    required = {monitor.ASSET, "cut-editor-stable.sig"}
    if not required.issubset(names):
        raise ValueError("Release sem manifesto e assinatura.")
    opener = build_opener(monitor.SafeRedirect())
    with tempfile.TemporaryDirectory() as d:
        for name,limit in ((monitor.ASSET,256*1024),("cut-editor-stable.sig",8192)):
            url = f"https://github.com/{monitor.REPO}/releases/download/{quote(tag,safe='')}/{name}"
            with opener.open(Request(url,headers={"User-Agent":"CutEditor-F13/0.2"}),timeout=20) as response:
                payload = response.read(limit+1)
            if len(payload)>limit:
                raise ValueError("Artefato de release acima do limite.")
            (Path(d)/name).write_bytes(payload)
        stage(Path(d)/monitor.ASSET,Path(d)/"cut-editor-stable.sig",lite)

def snapshot(args, services):
    images = {}
    for service in services:
        ids = run(*args,"ps","-q",service,capture=True,timeout=30).split()
        if len(ids) != 1:
            raise RuntimeError("Serviço precisa ter um container ativo: " + service)
        info = json.loads(run("docker","inspect",ids[0],capture=True,timeout=30))[0]
        if not info.get("State",{}).get("Running"):
            raise RuntimeError("Serviço não está em execução: " + service)
        image = info["Image"]
        if not re.fullmatch(r"sha256:[0-9a-f]{64}",image):
            raise ValueError("ID da imagem anterior inválido.")
        tag = "cut-editor-rollback/"+service+":"+image[7:]
        run("docker","image","tag",image,tag,timeout=30)
        images[service] = tag
    return images

def up(lite, override):
    args = compose(lite, override)
    run(*args,"config","--quiet",timeout=30)
    # No dependency recreation, builds, pulls or volume removal. Existing
    # database/Redis/Caddy are deliberately not upgraded by this prototype.
    run(*args,"up","-d","--no-deps","--no-build","--pull","never",
        "--wait","--wait-timeout","180",*selected(lite),timeout=240)
    run(*args,"exec","-T","web","node","-e",
        "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",timeout=30)
    run(*args,"exec","-T","mcp-http","bun","-e",
        "fetch('http://127.0.0.1:3101/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",timeout=30)
    if not lite:
        run(*args,"exec","-T","web","node","-e",
            "Promise.all(['http://local-ai:8080/health','http://parakeet:8707/health'].map(u=>fetch(u))).then(rs=>process.exit(rs.every(r=>r.ok)?0:1)).catch(()=>process.exit(1))",timeout=30)

def restore(journal):
    prior = STATE/"rollback-compose.json"
    if digest(prior) != journal["rollbackHash"]:
        raise RuntimeError("Override de rollback alterado; recuperação manual necessária.")
    up(journal["lite"], prior)
    # Keep the explicit old images on boot, including an unmanaged baseline.
    shutil.copyfile(prior,STATE/"active-compose.json")
    previous = journal.get("previous") or {"sequence":0,"commit":"local-baseline",
                                            "dataSchema":journal["dataSchema"],"lite":journal["lite"]}
    write(ACTIVE,{**previous,"overrideHash":digest(STATE/"active-compose.json"),"rolledBackAt":now()})
    JOURNAL.unlink()

def require_no_observed_activity(args):
    # Defense in depth for MANUAL maintenance, not a distributed lock.
    # The token is read inside the web container and never printed.
    script = """
const token=process.env.OPENCUT_AUTOMATION_TOKEN;
if(!token) process.exit(1);
fetch('http://127.0.0.1:3000/api/updates/status',{
  headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)
}).then(async r=>{
  if(!r.ok) process.exit(1);
  const body=await r.json();console.log(JSON.stringify(body.activity));
}).catch(()=>process.exit(1));
"""
    try:
        activity=json.loads(run(*args,"exec","-T","web","node","-e",script,capture=True,timeout=20))
    except (subprocess.SubprocessError,ValueError):
        raise RuntimeError("Não foi possível observar atividade do Editor. Atualize o baseline e confirme manutenção.") from None
    if not isinstance(activity,dict) or activity.get("state")!="no-observed-activity" or type(activity.get("recentSessions")) is not int or activity["recentSessions"]!=0 or type(activity.get("activeRenders")) is not int or activity["activeRenders"]!=0:
        raise RuntimeError("Há atividade recente ou estado desconhecido. Feche clientes, finalize jobs e aguarde.")
    
def activate(lite, receipt, baseline_schema):
    if JOURNAL.exists():
        raise RuntimeError("Transação interrompida; execute recover.")
    from backup import verify_receipt
    backup = verify_receipt(receipt)
    config = json.loads(run(*compose(lite,active_override(lite)),"config","--format","json",capture=True,timeout=30))
    if backup["project"] != config["name"]:
        raise RuntimeError("Backup pertence a outro projeto Compose.")
    for filename, source in {"config-env":".env","config-docker-compose.yml":"docker-compose.yml","config-Caddyfile":"Caddyfile","config-compose.lite.yml":"deploy/mobile/compose.lite.yml"}.items():
        if backup["files"][filename] != digest(ROOT/source):
            raise RuntimeError("Configuração mudou após backup: "+source)
    staged = read(STAGED)
    if staged["lite"] != lite:
        raise RuntimeError("Perfil difere da etapa de download.")
    data = verify(STATE/"staged-manifest.json",STATE/"staged-manifest.sig")
    previous = read(ACTIVE) if ACTIVE.exists() else None
    check_sequence(data,previous)
    if not previous and baseline_schema != data["dataSchema"]:
        raise ValueError("Baseline sem schema confirmado; não aplicar atualização.")
    images = {s:data["images"][MAP[s]] for s in selected(lite)}
    if images != staged["images"] or data["commit"] != staged["commit"] or data["sequence"] != staged["sequence"]:
        raise RuntimeError("Estado de staging divergente.")
    prior_override = active_override(lite)
    args = compose(lite,prior_override)
    require_no_observed_activity(args)
    old = snapshot(args,selected(lite))
    candidate = STATE/"candidate-compose.json"
    rollback = STATE/"rollback-compose.json"
    image_override(candidate,images)
    image_override(rollback,old)
    journal = {"commit":data["commit"],"lite":lite,"previous":previous,
               "rollbackHash":digest(rollback),"dataSchema":data["dataSchema"],
               "backupReceiptSha256":digest(receipt),"startedAt":now()}
    require_no_observed_activity(args)
    write(JOURNAL,journal)
    try:
        up(lite,candidate)
        shutil.copyfile(candidate,STATE/"active-compose.json")
        write(ACTIVE,{"commit":data["commit"],"sequence":data["sequence"],"lite":lite,
                      "dataSchema":data["dataSchema"],"overrideHash":digest(STATE/"active-compose.json"),
                      "installedAt":now()})
        JOURNAL.unlink()
        print("Versão ativada; healthchecks básicos passaram.")
    except Exception:
        print("Ativação falhou; tentando restaurar imagens anteriores.",file=sys.stderr)
        restore(journal)
        raise

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("action",choices=("stage","stage-latest","activate","recover","status"))
    p.add_argument("--lite",action="store_true")
    p.add_argument("--manifest",type=Path)
    p.add_argument("--signature",type=Path)
    p.add_argument("--maintenance-confirmed",action="store_true")
    p.add_argument("--backup-receipt",type=Path)
    p.add_argument("--baseline-schema")
    a=p.parse_args()
    with lock():
        if a.action=="status":
            print(json.dumps({"active":read(ACTIVE) if ACTIVE.exists() else None,
                              "staged":read(STAGED) if STAGED.exists() else None,
                              "recoveryRequired":JOURNAL.exists(),"autoInstall":False},indent=2))
        elif a.action=="stage":
            if not a.manifest or not a.signature: p.error("stage exige --manifest e --signature")
            stage(a.manifest,a.signature,a.lite)
        elif a.action=="stage-latest":
            stage_latest(a.lite)
        elif a.action=="activate":
            if not a.maintenance_confirmed or not a.backup_receipt:
                p.error("activate exige manutenção confirmada (todos os clientes fechados e jobs encerrados) e backup completo externo")
            activate(a.lite,a.backup_receipt,a.baseline_schema)
        elif a.action=="recover":
            if not a.maintenance_confirmed: p.error("recover exige manutenção confirmada")
            if not JOURNAL.exists(): raise RuntimeError("Não há transação interrompida.")
            restore(read(JOURNAL))

if __name__=="__main__":
    try:
        try:
            main()
        finally:
            try:
                status_export.export(STATE)
            except OSError:
                print("Status público não pôde ser atualizado.",file=sys.stderr)
    except (RuntimeError,ValueError,OSError,subprocess.SubprocessError) as exc:
        print("Atualizador interrompido:",type(exc).__name__,str(exc),file=sys.stderr)
        sys.exit(1)
