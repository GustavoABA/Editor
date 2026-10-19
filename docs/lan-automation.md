# LAN, MCP, Ollama and n8n automation

This OpenCut Classic build keeps uploaded media, automatic edits and final rendering on the host computer. A browser on another computer only sends media and project commands over the LAN, then downloads the rendered file from the host.

## Start automatically

The Compose services use `restart: unless-stopped`. Start them once with:

```powershell
docker compose up -d
```

After Docker Desktop starts with Windows, OpenCut returns automatically at:

- Editor: `http://HOST_IP:3100`
- MCP Streamable HTTP: `http://HOST_IP:3101/mcp`
- Health check: `http://HOST_IP:3100/api/health`

Keep ports 3100 and 3101 limited to the trusted LAN. The MCP and inbound n8n endpoints require a bearer token.

## MCP clients

The HTTP endpoint implements Streamable HTTP and advertises tools for:

- discovering active editor sessions and reading project snapshots;
- Auto Cut, caption styles, split, delete and text edits;
- undo/redo;
- server-side export and render status.

Configure an MCP client with:

```json
{
  "url": "http://HOST_IP:3101/mcp",
  "headers": {
    "Authorization": "Bearer YOUR_OPENCUT_AUTOMATION_TOKEN"
  }
}
```

For a local stdio client on Windows, use `script\\opencut-mcp.cmd`. The token is `OPENCUT_AUTOMATION_TOKEN`; Docker Compose currently derives it from `BETTER_AUTH_SECRET`. Do not expose it in prompts, workflow logs or public repositories.

The editor tab must remain open while an AI applies interactive timeline commands. Its session heartbeat appears in `list_editor_sessions`.

## Ollama

Open **IA & Automação** in the editor. The panel detects local Ollama models and uses `qwen2.5:1.5b` by default. Override it before starting Compose if desired:

```powershell
$env:OLLAMA_MODEL = "qwen3:4b"
docker compose up -d --force-recreate web
```

The assistant first creates a reviewed plan. It only applies the allow-listed commands after **Aplicar plano** is clicked. Element and track IDs are reconciled against the live server snapshot before execution.

## n8n: receive rendered videos

1. Import [`n8n/opencut-receive-export.json`](n8n/opencut-receive-export.json) in n8n.
2. Add storage or publishing nodes after the Webhook node if needed.
3. Activate the workflow.
4. In OpenCut, open **IA & Automação** and enter `/webhook/opencut-video`.
5. During export, enable **Enviar o vídeo pronto ao webhook configurado**.

OpenCut sends a `multipart/form-data` request. The rendered file is the binary field `video`; `jobId`, `projectName`, `format` and `quality` are normal fields. A delivery failure is recorded on the render job and never deletes the downloadable render.

## n8n: send media into OpenCut

Use an n8n **HTTP Request** node:

- Method: `POST`
- URL: `http://host.docker.internal:3100/api/integrations/n8n/media` when n8n runs in Docker, or `http://HOST_IP:3100/api/integrations/n8n/media` otherwise
- Header: `Authorization: Bearer YOUR_OPENCUT_AUTOMATION_TOKEN`
- Body type: `Form-Data`
- Binary field name: `video` (or `file`)

The file appears under **IA & Automação → Arquivos recebidos do n8n**. Click **Importar** to add it to the current project.

## Diagnostics

```powershell
Invoke-RestMethod http://127.0.0.1:3100/api/health
Invoke-RestMethod http://127.0.0.1:3100/api/integrations/status
Invoke-RestMethod http://127.0.0.1:3101/health
docker compose ps
docker compose logs --tail=100 web mcp-http
```

