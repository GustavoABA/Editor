#!/usr/bin/env python3
"""One-time explicit host-admin provisioning for systemd Linux."""
import argparse
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[2]
UNITS=("cut-editor-modules.service","cut-editor-modules.timer")

def render(name,root):
    if name not in UNITS: raise ValueError("Unknown unit")
    if not re.fullmatch(r"/[A-Za-z0-9_./-]+",str(root)):
        raise ValueError("Use um caminho absoluto sem espaços ou caracteres especiais.")
    return (root/"deploy/modules"/name).read_text().replace("/opt/cut-editor",str(root))

def provision(root=ROOT, destination=Path("/etc/systemd/system")):
    if os.geteuid()!=0: raise RuntimeError("Execute como administrador do host.")
    if not Path("/run/systemd/system").is_dir(): raise RuntimeError("Host sem systemd ativo; use o agendador compatível.")
    # A root-operated Docker supervisor must only execute a trusted checkout.
    trusted=(root,*root.parents,root/"deploy",root/"deploy/modules",root/"deploy/mobile",root/"deploy/modules/evolution",root/"deploy/modules/supervisor.py",root/"deploy/modules/catalog.json",root/"deploy/modules/evolution/compose.yml",root/"deploy/mobile/updater.py",root/"deploy/mobile/release_monitor.py",root/"deploy/mobile/status_export.py",*(root/"deploy/modules"/n for n in UNITS))
    for file in trusted:
        if file.is_symlink() or file.stat().st_uid!=0 or file.stat().st_mode & 0o022:
            raise RuntimeError("O checkout privilegiado deve ser root-owned e não gravável por grupo/outros.")
    for name in UNITS:
        body=render(name,root)
        target=destination/name
        fd,tmp=tempfile.mkstemp(prefix=".cut-editor-",dir=destination)
        try:
            with os.fdopen(fd,"w") as out:
                out.write(body)
                os.fchmod(out.fileno(),0o644)
                out.flush()
                os.fsync(out.fileno())
            os.replace(tmp,target)
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
    subprocess.run(["systemctl","daemon-reload"],check=True)
    subprocess.run(["systemctl","enable","--now","cut-editor-modules.timer"],check=True)

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--confirm-trusted-checkout",action="store_true")
    a=p.parse_args()
    if not a.confirm_trusted_checkout: p.error("Confirme explicitamente que o checkout e seus ancestrais são confiáveis para execução privilegiada.")
    try: provision()
    except (RuntimeError,ValueError,OSError,subprocess.SubprocessError) as e:
        print("Provisionamento interrompido:",e,file=sys.stderr)
        sys.exit(1)
