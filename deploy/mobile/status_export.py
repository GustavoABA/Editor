"""Write a minimal public-to-container status snapshot; never expose .cut-editor."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / ".cut-editor-status"

def safe_commit(value):
    return value if isinstance(value,str) and re.fullmatch(r"[0-9a-f]{40}|local-baseline",value) else None

def load(path):
    try:
        data=json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data,dict) else {}
    except (OSError,ValueError):
        return {}

def export(state_dir, monitor=None, directory=PUBLIC):
    directory.mkdir(mode=0o755,exist_ok=True)
    active=load(state_dir/"active.json")
    staged=load(state_dir/"staged.json")
    previous=load(directory/"status.json")
    checked=monitor if isinstance(monitor,dict) else previous.get("monitor",{})
    if not isinstance(checked,dict):
        checked={}
    statuses={"no-public-stable-release","no-stable-manifest","stable-manifest-discovered-unverified","check-failed"}
    payload={"schema":1,"autoInstall":False,
        "activeCommit":safe_commit(active.get("commit")),
        "stagedCommit":safe_commit(staged.get("commit")),
        "recoveryRequired":(state_dir/"transaction.json").exists(),
        "profile":("lite" if active.get("lite") else "full") if active else None,
        "monitor":{"status":checked.get("status") if checked.get("status") in statuses else "not-checked",
                   "commit":safe_commit(checked.get("commit")),
                   "checkedAt":str(checked.get("checkedAt",""))[:40]},
        "exportedAt":datetime.now(timezone.utc).isoformat()}
    fd,tmp=tempfile.mkstemp(prefix=".status-",dir=directory)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as out:
            json.dump(payload,out)
            out.flush()
            os.fsync(out.fileno())
            os.fchmod(out.fileno(),0o644)
        os.replace(tmp,directory/"status.json")
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return payload
