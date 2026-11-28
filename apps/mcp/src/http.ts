import { createHmac, timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createOpenCutMcpServer } from "./server";

const handler = createMcpHandler(createOpenCutMcpServer);
const token = process.env.OPENCUT_AUTOMATION_TOKEN ?? "";
const port = Number(process.env.PORT ?? 3101);
const externalToken = token.length >= 16 ? createHmac("sha256", token).update("cut-editor:mcp-external:v1").digest("hex") : "";
function matches(candidate: string, expected: string) {
  const a = Buffer.from(candidate), b = Buffer.from(expected);
  return b.length > 0 && a.length === b.length && timingSafeEqual(a,b);
}

Bun.serve({
	port,
	hostname: "0.0.0.0",
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/health") {
			return Response.json({ status: "ok", transport: "streamable-http" });
		}
		if (url.pathname !== "/mcp") {
			return new Response("Not found", { status: 404 });
		}
		const supplied = request.headers.get("authorization") || "";
		if (!(externalToken && matches(supplied, `Bearer ${externalToken}`)) && !(token && matches(supplied, `Bearer ${token}`))) {
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		}
		if (request.headers.has("origin")) {
			return Response.json(
				{ error: "Browser origins are not accepted by this MCP endpoint" },
				{ status: 403 },
			);
		}
		return handler.fetch(request);
	},
});

console.error(`OpenCut Classic MCP HTTP is listening on port ${port}`);

