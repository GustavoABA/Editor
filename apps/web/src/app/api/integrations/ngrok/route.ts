import { authorizeSync } from "@/lan-sync/server";

export const runtime = "nodejs";
const AGENT_API = "http://ngrok:4040/api";
const ENDPOINT_NAME = "opencut_mcp";
const UPSTREAM = "http://mcp-http:3101";

function getAgentApi(): string {
  return (process.env.MCP_NGROK_AGENT_URL || AGENT_API).replace(/\/$/, "");
}
function admin(request: Request): Response | null {
  return authorizeSync(request);
}
type AgentEndpoint = { name?: string; url?: string; upstream?: { url?: string } };
async function listMcpEndpoint(): Promise<AgentEndpoint | null> {
  const response = await fetch(getAgentApi() + "/endpoints", {
    cache: "no-store", signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error("ngrok agent HTTP " + response.status);
  const raw: unknown = await response.json();
  const body = raw as { endpoints?: AgentEndpoint[] };
  return (Array.isArray(body.endpoints) ? body.endpoints : []).find(
    (item) => item.name === ENDPOINT_NAME && item.upstream?.url === UPSTREAM,
  ) || null;
}

export async function GET(request: Request) {
  const denied = admin(request);
  if (denied) return denied;
  try {
    const endpoint = await listMcpEndpoint();
    return Response.json({ agentAvailable: true, active: Boolean(endpoint),
      url: endpoint?.url || null, target: "MCP somente" });
  } catch {
    return Response.json({ agentAvailable: false, active: false, url: null,
      error: "Inicie o perfil mcp-tunnel e configure NGROK_AUTHTOKEN no host." });
  }
}

export async function POST(request: Request) {
  const denied = admin(request);
  if (denied) return denied;
  const current = await listMcpEndpoint().catch(() => null);
  if (current) return Response.json({ active: true, url: current.url });
  try {
    const response = await fetch(getAgentApi() + "/endpoints", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ENDPOINT_NAME, upstream: { url: UPSTREAM },
        inspect: false }),
    });
    if (!response.ok) throw new Error("ngrok HTTP " + response.status);
    const data = await response.json() as AgentEndpoint;
    if (data.upstream?.url !== UPSTREAM || typeof data.url !== "string") {
      throw new Error("Agent returned unexpected MCP endpoint");
    }
    return Response.json({ active: true, url: data.url });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to start tunnel" },
      { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const denied = admin(request);
  if (denied) return denied;
  try {
    const current = await listMcpEndpoint();
    if (!current) return Response.json({ active: false });
    const response = await fetch(getAgentApi() + "/endpoints/" + ENDPOINT_NAME, {
      method: "DELETE", cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok && response.status !== 404) throw new Error("Agent HTTP " + response.status);
    return Response.json({ active: false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to stop tunnel" },
      { status: 502 });
  }
}
