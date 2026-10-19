import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkJson(url: string): Promise<{ ok: boolean; data?: unknown }> {
	try {
		const response = await fetch(url, {
			cache: "no-store",
			signal: AbortSignal.timeout(3_000),
		});
		return {
			ok: response.ok,
			...(response.ok ? { data: (await response.json()) as unknown } : {}),
		};
	} catch {
		return { ok: false };
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
	const n8nBase = process.env.N8N_BASE_URL ?? "http://host.docker.internal:5678";
	const ollamaBase =
		process.env.OLLAMA_BASE_URL ?? "http://host.docker.internal:11434";
	const mcpBase = process.env.MCP_HTTP_URL ?? "http://mcp-http:3101";
	const [n8n, ollama, mcp] = await Promise.all([
		checkJson(`${n8nBase.replace(/\/$/, "")}/healthz`),
		checkJson(`${ollamaBase.replace(/\/$/, "")}/api/tags`),
		checkJson(`${mcpBase.replace(/\/$/, "")}/health`),
	]);
	const models =
		ollama.ok && isRecord(ollama.data) && Array.isArray(ollama.data.models)
			? ollama.data.models.flatMap((model) =>
					isRecord(model) && typeof model.name === "string" ? [model.name] : [],
				)
			: [];
	return NextResponse.json({
		n8n: { connected: n8n.ok },
		ollama: { connected: ollama.ok, models },
		mcp: { connected: mcp.ok, endpoint: "/mcp", port: 3101 },
	});
}

