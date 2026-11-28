#!/usr/bin/env python3
"""F13-E first stage: read-only stable release discovery. Never installs images."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

REPO = "GustavoABA/Editor"
API = "https://api.github.com/repos/" + REPO + "/releases/latest"
ASSET = "cut-editor-stable.json"
SERVICES = {"web", "local-ai", "parakeet", "mcp"}
FILES = {"docker-compose.yml", "Caddyfile", "deploy/mobile/compose.lite.yml"}
HEX = r"[0-9a-f]{64}"
SHA = r"[0-9a-f]{40}"
TAG = r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}"
HOSTS = {"api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"}

class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        url = urlsplit(newurl)
        if url.scheme != "https" or url.hostname not in HOSTS or url.username or url.password or url.port not in (None,443):
            raise ValueError("Redirecionamento de release não permitido.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def read_json(url):
    opener = build_opener(SafeRedirect())
    request = Request(url, headers={"User-Agent": "CutEditor-F13/0.1", "Accept": "application/json"})
    with opener.open(request, timeout=20) as response:
        data = response.read(256 * 1024 + 1)
        if len(data) > 256 * 1024:
            raise ValueError("Resposta de release acima do limite.")
        return json.loads(data)

def validate_manifest(manifest):
    if not isinstance(manifest, dict) or manifest.get("schema") != 1 or manifest.get("channel") != "stable":
        raise ValueError("Manifesto não pertence ao canal estável.")
    if not re.fullmatch(SHA, str(manifest.get("commit", ""))):
        raise ValueError("Commit de release inválido.")
    platforms = manifest.get("platforms")
    if not isinstance(platforms, list) or not {"linux/amd64", "linux/arm64"}.issubset(platforms):
        raise ValueError("Manifesto sem ambas as arquiteturas.")
    images = manifest.get("images")
    if not isinstance(images, dict) or set(images) != SERVICES:
        raise ValueError("Manifesto de serviços incompleto.")
    for service, image in images.items():
        prefix = "ghcr.io/gustavoaba/editor-" + service + "@sha256:"
        if not isinstance(image, str) or not re.fullmatch(re.escape(prefix) + HEX, image):
            raise ValueError("Imagem não fixada por digest ou fora do registry autorizado.")
    files = manifest.get("files")
    if not isinstance(files, dict) or set(files) != FILES or any(not re.fullmatch(HEX, str(v)) for v in files.values()):
        raise ValueError("Hashes de deployment incompletos.")
    return manifest

def discover(fetch=read_json):
    try:
        release = fetch(API)
    except HTTPError as exc:
        if exc.code == 404:
            return {"status": "no-public-stable-release"}
        raise
    if not isinstance(release, dict) or release.get("draft") or release.get("prerelease"):
        return {"status": "no-public-stable-release"}
    tag = release.get("tag_name")
    if not isinstance(tag, str) or not re.fullmatch(TAG, tag):
        raise ValueError("Tag de release inválida.")
    assets = release.get("assets")
    if not isinstance(assets, list) or not any(isinstance(a, dict) and a.get("name") == ASSET for a in assets):
        return {"status": "no-stable-manifest", "tag": tag}
    url = f"https://github.com/{REPO}/releases/download/{quote(tag, safe='')}/{ASSET}"
    manifest = validate_manifest(fetch(url))
    # Schema/digest names alone do not establish provenance. No Docker operation
    # is possible until the signature, CI gate and transaction manager exist.
    return {"status": "stable-manifest-discovered-unverified", "tag": tag,
            "commit": manifest["commit"], "autoInstall": False}

def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(prefix=".monitor-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, default=Path.home()/".local/state/cut-editor/monitor.json")
    args = parser.parse_args()
    try:
        state = discover()
    except Exception as exc:
        # Record a category, not raw URLs, response bodies or credentials.
        state = {"status": "check-failed", "error": type(exc).__name__, "autoInstall": False}
    state.update({"checkedAt": datetime.now(timezone.utc).isoformat(), "autoInstall": False})
    save_state(args.state, state)
    print(json.dumps(state, ensure_ascii=False))
    return 1 if state["status"] == "check-failed" else 0

if __name__ == "__main__":
    raise SystemExit(main())
