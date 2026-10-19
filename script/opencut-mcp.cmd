@echo off
docker compose -f "%~dp0..\docker-compose.yml" --profile tools run --rm -T mcp

