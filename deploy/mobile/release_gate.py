#!/usr/bin/env python3
"""Validate candidate and promotion evidence. Fails closed; does not publish."""
import argparse
import hashlib
import json
from pathlib import Path
import re

import release_monitor as monitor

REQUIRED_CI = {"Bun CI", "Editor Next Fast Build", "Docker production smoke"}
EXTERNAL = {"db","redis","serverless-redis-http","caddy","importer"}

def validate_candidate(candidate, sha, root):
    if not isinstance(candidate,dict) or candidate.get("channel")!="candidate" or candidate.get("commit")!=sha:
        raise ValueError("Candidate must match the exact main commit.")
    clean = monitor.validate_manifest({**candidate,"channel":"stable"})
    for path,expected in clean["files"].items():
        if hashlib.sha256((root/path).read_bytes()).hexdigest()!=expected:
            raise ValueError("Deployment hash mismatch: "+path)
    return clean

def validate_ci(runs,sha):
    # Latest attempt for each exact-commit main push must have succeeded.
    latest={}
    for run in runs:
        if run.get("head_sha")!=sha or run.get("head_branch")!="main" or run.get("event")!="push":
            continue
        name=run.get("name")
        if name in REQUIRED_CI and (name not in latest or run["id"]>latest[name]["id"]):
            latest[name]=run
    missing=REQUIRED_CI-{name for name,run in latest.items()
                         if run.get("status")=="completed" and run.get("conclusion")=="success"}
    if missing:
        raise ValueError("Missing successful CI on exact main commit: "+", ".join(sorted(missing)))

def verify_external_pins(config):
    services=config.get("services",{})
    for name in EXTERNAL:
        image=services.get(name,{}).get("image","")
        if not re.fullmatch(r"[^\s@]+@sha256:[0-9a-f]{64}",image):
            raise ValueError("Third-party image needs approved digest: "+name)

def make_manifest(candidate,sha,root,sequence,schema,approved):
    if approved is not True:
        raise ValueError("Native runtime and rollback compatibility require approval.")
    if type(sequence) is not int or sequence<1 or not re.fullmatch(r"[A-Za-z0-9._-]{1,80}",schema):
        raise ValueError("Invalid release sequence or schema.")
    clean=validate_candidate(candidate,sha,root)
    return {**clean,"sequence":sequence,"dataSchema":schema,"rollbackSafe":True}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("action",choices=("validate","prepare"))
    p.add_argument("--candidate",type=Path,required=True)
    p.add_argument("--sha",required=True)
    p.add_argument("--ci",type=Path,required=True)
    p.add_argument("--compose",type=Path,required=True)
    p.add_argument("--sequence",type=int)
    p.add_argument("--data-schema")
    p.add_argument("--approved",action="store_true")
    p.add_argument("--output",type=Path,default=Path("cut-editor-stable.json"))
    a=p.parse_args()
    root=Path(__file__).resolve().parents[2]
    candidate=json.loads(a.candidate.read_text())
    validate_candidate(candidate,a.sha,root)
    validate_ci(json.loads(a.ci.read_text()),a.sha)
    verify_external_pins(json.loads(a.compose.read_text()))
    if a.action=="prepare":
        data=make_manifest(candidate,a.sha,root,a.sequence,a.data_schema or "",a.approved)
        with a.output.open("x") as out:
            json.dump(data,out,indent=2,sort_keys=True)
            out.write("\n")
    print("Release gate passed.")

if __name__=="__main__":
    main()
