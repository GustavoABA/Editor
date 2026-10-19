import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createOpenCutMcpServer } from "./server";

const handle = serveStdio(createOpenCutMcpServer);

console.error("OpenCut Classic MCP is listening on stdio");

process.on("SIGINT", () => {
	void handle.close();
});

