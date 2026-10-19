# OpenCut Classic MCP

This MCP server controls an OpenCut project that is currently open in a browser.
It supports both local stdio and authenticated Streamable HTTP.

## Stdio

Configure an MCP host to launch:

```text
script/opencut-mcp.cmd
```

The wrapper starts the MCP server in Docker and keeps protocol output isolated on
stdout.

## LAN HTTP

The always-on endpoint is:

```text
http://<OpenCut-host-IP>:3101/mcp
```

Send `Authorization: Bearer <OPENCUT_AUTOMATION_TOKEN>`. The token is the value
configured on the OpenCut host; do not put it in prompts or commit it to source.

Keep the target project open in OpenCut while an agent edits it. Start with
`list_editor_sessions`, then use the returned online `sessionId`.

