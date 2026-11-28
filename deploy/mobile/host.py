#!/usr/bin/env python3
"""Host-only bootstrap for a compatible Linux Docker installation (F13-A/D).
Never source .env, expose Docker socket, or delete volumes.
"""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import updater
import status_export

ROOT = Path(__file__).resolve().parents[2]

def docker(*args, capture=False):
    return subprocess.run(["docker", *args], cwd=ROOT, check=True,
                          text=True, capture_output=capture).stdout if capture else subprocess.run(["docker", *args], cwd=ROOT, check=True).returncode

def lan_host(explicit=None):
    if explicit:
        try:
            ip = ipaddress.ip_address(explicit)
            if ip.version == 4 and not (ip.is_loopback or ip.is_unspecified or ip.is_multicast or ip.is_link_local):
                return str(ip)
        except ValueError:
            pass
        raise ValueError("Informe um IPv4 LAN válido com --lan-host.")
    # A route lookup is local; this does not send network packets.
    if not shutil.which("ip"):
        raise ValueError("Comando ip ausente. Informe --lan-host.")
    try:
        result = subprocess.run(["ip", "-j", "-4", "route", "get", "1.1.1.1"],
                                check=True, text=True, capture_output=True)
        route = json.loads(result.stdout)[0]
        return lan_host(route.get("prefsrc") or route.get("src") or "invalid")
    except (subprocess.CalledProcessError, ValueError, IndexError, KeyError):
        raise ValueError("Não foi possível determinar o IP LAN. Informe --lan-host.") from None

def preflight():
    if not shutil.which("docker"):
        raise RuntimeError("Docker CLI não encontrado. Instale Docker Engine e Compose no host compatível.")
    info = json.loads(docker("info", "--format", "{{json .}}", capture=True))
    if info.get("OSType") != "linux":
        raise RuntimeError("O daemon precisa executar containers Linux.")
    arch = info.get("Architecture")
    if arch not in ("x86_64", "amd64", "aarch64", "arm64"):
        raise RuntimeError("Arquitetura Docker não suportada: " + str(arch))
    docker("compose", "version")
    free = shutil.disk_usage(ROOT).free
    print("Docker daemon:", arch, "| Espaço livre no filesystem do projeto:", round(free / 2**30, 1), "GiB")
    print("Atenção: confirme também o espaço do armazenamento interno do daemon Docker.")

def env_values(host):
    return {
        "BETTER_AUTH_SECRET": secrets.token_hex(32),
        "UPSTASH_REDIS_REST_TOKEN": secrets.token_hex(32),
        "OPENCUT_LAN_SYNC_TOKEN": secrets.token_hex(32),
        "OPENCUT_LAN_HOST": host,
        "NEXT_PUBLIC_SITE_URL": "https://" + host,
        "FREESOUND_CLIENT_ID": "placeholder",
        "FREESOUND_API_KEY": "placeholder",
        "MARBLE_WORKSPACE_KEY": "placeholder",
    }

def create_env(host, path):
    # O_EXCL is intentional: existing configuration and secrets are never replaced.
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    try:
        fd = os.open(path, flags, 0o600)
    except FileExistsError:
        return False
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        for k, v in env_values(host).items():
            out.write(f"{k}={v}\n")
    return True

def configured_host(path):
    # Read only this simple public setting; don't print or evaluate other keys.
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.fullmatch(r"\s*OPENCUT_LAN_HOST\s*=\s*([^#]+?)\s*(?:#.*)?", line)
        if m:
            return m[1].strip().strip("'\"")
    return None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "init", "start", "status"))
    parser.add_argument("--lan-host", help="IPv4 do host ou endereço encaminhado da VM")
    parser.add_argument("--build", action="store_true", help="Somente desenvolvimento: compila imagens localmente")
    parser.add_argument("--lite", action="store_true", help="Inicia apenas serviços essenciais (override experimental)")
    args = parser.parse_args()
    if args.build and args.action != "start":
        parser.error("--build só é válido com start")
    preflight()
    if args.action == "status":
        docker("compose", "ps")
        return
    path = ROOT / ".env"
    if args.action == "init":
        if path.exists():
            print("Configuração existente preservada.")
        else:
            host = lan_host(args.lan_host)
            print("Configuração criada." if create_env(host, path) else "Configuração existente preservada.")
    if args.action == "check" and not path.exists():
        print("Preflight do daemon concluído; execute init para criar .env.")
        return
    if not path.is_file():
        raise RuntimeError("Execute init primeiro; .env não encontrado.")
    host = configured_host(path)
    if not host:
        raise RuntimeError("Defina OPENCUT_LAN_HOST no .env existente.")
    if args.lan_host and host != args.lan_host:
        raise RuntimeError("IP difere do .env existente. Ajuste OPENCUT_LAN_HOST e NEXT_PUBLIC_SITE_URL explicitamente.")
    compose = ["compose"]
    if args.lite:
        compose += ["-f", "docker-compose.yml", "-f", "deploy/mobile/compose.lite.yml"]
    docker(*compose, "config", "--quiet")
    print("LAN HTTP:", "http://" + host + ":3100")
    print("LAN HTTPS:", "https://" + host, "(CA local precisa ser confiável)")
    if args.action == "start":
        status_export.PUBLIC.mkdir(mode=0o755,exist_ok=True)
        with updater.lock():
            override = updater.active_override(args.lite)
            if override:
                if args.build:
                    raise RuntimeError("Instalação gerenciada: use updater.py, não --build.")
                compose = ["compose", "--project-directory", str(ROOT), "-f", str(ROOT / "docker-compose.yml")]
                if args.lite:
                    compose += ["-f", str(ROOT / "deploy/mobile/compose.lite.yml")]
                compose += ["-f", str(override)]
            options = ["--build"] if args.build else ["--no-build", "--pull", "never"]
            docker(*compose, "up", "-d", *options)
            docker(*compose, "ps")
            status_export.export(updater.STATE)

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, subprocess.CalledProcessError) as exc:
        print("Falha:", exc, file=sys.stderr)
        sys.exit(1)
