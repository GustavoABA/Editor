import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

const baseUrl = (process.env.OPENCUT_BASE_URL ?? "http://127.0.0.1:3100").replace(
	/\/$/,
	"",
);
const automationToken = process.env.OPENCUT_AUTOMATION_TOKEN ?? "";
const commandTimeoutMs = Number(
	process.env.OPENCUT_COMMAND_TIMEOUT_MS ?? 180_000,
);

function jsonText(value: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestJson({
	path,
	method = "GET",
	body,
	requiresToken = true,
}: {
	path: string;
	method?: "GET" | "POST";
	body?: unknown;
	requiresToken?: boolean;
}): Promise<unknown> {
	if (requiresToken && !automationToken) {
		throw new Error("OPENCUT_AUTOMATION_TOKEN is not configured");
	}
	const response = await fetch(`${baseUrl}${path}`, {
		method,
		headers: {
			...(requiresToken ? { Authorization: `Bearer ${automationToken}` } : {}),
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const payload: unknown = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(
			isRecord(payload) && typeof payload.error === "string"
				? payload.error
				: `OpenCut request failed with status ${response.status}`,
		);
	}
	return payload;
}

async function enqueueAndWait({
	sessionId,
	type,
	payload,
}: {
	sessionId: string;
	type: string;
	payload: Record<string, unknown>;
}): Promise<unknown> {
	const created = await requestJson({
		path: "/api/automation/commands",
		method: "POST",
		body: { sessionId, type, payload },
	});
	if (
		!isRecord(created) ||
		!isRecord(created.command) ||
		typeof created.command.id !== "string"
	) {
		throw new Error("OpenCut returned an invalid automation command");
	}
	const commandId = created.command.id;
	const deadline = Date.now() + commandTimeoutMs;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 750));
		const response = await requestJson({
			path: `/api/automation/commands/${commandId}`,
		});
		if (!isRecord(response) || !isRecord(response.command)) continue;
		const command = response.command;
		if (command.status === "complete") return command.result ?? {};
		if (command.status === "failed") {
			throw new Error(
				typeof command.error === "string" ? command.error : "Editor command failed",
			);
		}
	}
	throw new Error(
		"The editor did not finish the command in time. Keep the project open in a browser and try again.",
	);
}

export function createOpenCutMcpServer(): McpServer {
	const server = new McpServer({ name: "opencut-classic-lan", version: "0.1.0" });

	server.registerTool(
		"list_editor_sessions",
		{
			description:
				"List OpenCut editor sessions currently visible on the LAN host. Use an online session id for editing tools.",
			inputSchema: z.object({}),
		},
		async () => jsonText(await requestJson({ path: "/api/automation/sessions" })),
	);

	server.registerTool(
		"get_project_snapshot",
		{
			description:
				"Read the current project, tracks, clip ids, text contents, timings, and imported media from an open editor session.",
			inputSchema: z.object({ sessionId: z.string().uuid() }),
		},
		async ({ sessionId }) =>
			jsonText(
				await requestJson({ path: `/api/automation/sessions/${sessionId}` }),
			),
	);

	server.registerTool(
		"auto_cut",
		{
			description:
				"Analyze the whole timeline on the OpenCut server and remove silence. The edit is undoable.",
			inputSchema: z.object({
				sessionId: z.string().uuid(),
				preset: z.enum(["gentle", "balanced", "dynamic"]).default("balanced"),
			}),
		},
		async ({ sessionId, preset }) =>
			jsonText(
				await enqueueAndWait({ sessionId, type: "auto_cut", payload: { preset } }),
			),
	);

	server.registerTool(
		"set_caption_style",
		{
			description:
				"Apply a readable style and vertical placement to every generated caption in the current scene.",
			inputSchema: z.object({
				sessionId: z.string().uuid(),
				placement: z.enum(["top", "middle", "bottom"]),
				preset: z.enum(["clean", "box", "social"]).default("clean"),
			}),
		},
		async ({ sessionId, placement, preset }) =>
			jsonText(
				await enqueueAndWait({
					sessionId,
					type: "set_caption_style",
					payload: { placement, preset },
				}),
			),
	);

	server.registerTool(
		"split_at",
		{
			description:
				"Split every timeline element crossing a time in seconds. The edit is undoable.",
			inputSchema: z.object({
				sessionId: z.string().uuid(),
				seconds: z.number().nonnegative(),
			}),
		},
		async ({ sessionId, seconds }) =>
			jsonText(
				await enqueueAndWait({ sessionId, type: "split_at", payload: { seconds } }),
			),
	);

	server.registerTool(
		"delete_elements",
		{
			description:
				"Delete timeline elements by track id and element id. Read the project snapshot first. The edit is undoable.",
			inputSchema: z.object({
				sessionId: z.string().uuid(),
				elements: z
					.array(z.object({ trackId: z.string(), elementId: z.string() }))
					.min(1),
			}),
		},
		async ({ sessionId, elements }) =>
			jsonText(
				await enqueueAndWait({
					sessionId,
					type: "delete_elements",
					payload: { elements },
				}),
			),
	);

	server.registerTool(
		"update_text",
		{
			description:
				"Replace the visible content of a text or caption element. Read the project snapshot first. The edit is undoable.",
			inputSchema: z.object({
				sessionId: z.string().uuid(),
				trackId: z.string(),
				elementId: z.string(),
				content: z.string().min(1),
			}),
		},
		async ({ sessionId, trackId, elementId, content }) =>
			jsonText(
				await enqueueAndWait({
					sessionId,
					type: "update_text",
					payload: { trackId, elementId, content },
				}),
			),
	);

	for (const action of ["undo", "redo"] as const) {
		server.registerTool(
			action,
			{
				description: `${action === "undo" ? "Undo" : "Redo"} the latest OpenCut editor command.`,
				inputSchema: z.object({ sessionId: z.string().uuid() }),
			},
			async ({ sessionId }) =>
				jsonText(
					await enqueueAndWait({ sessionId, type: action, payload: {} }),
				),
		);
	}

	server.registerTool(
		"export_video",
		{
			description:
				"Upload the open project to the LAN render server and start a downloadable server-side export.",
			inputSchema: z.object({
				sessionId: z.string().uuid(),
				format: z.enum(["mp4", "webm"]).default("mp4"),
				quality: z
					.enum(["low", "medium", "high", "very_high"])
					.default("high"),
				includeAudio: z.boolean().default(true),
				n8nWebhookPath: z.string().optional(),
			}),
		},
		async ({ sessionId, format, quality, includeAudio, n8nWebhookPath }) =>
			jsonText(
				await enqueueAndWait({
					sessionId,
					type: "export",
					payload: { format, quality, includeAudio, n8nWebhookPath },
				}),
			),
	);

	server.registerTool(
		"get_render_status",
		{
			description:
				"Read progress and the download URL for a server-side OpenCut render job.",
			inputSchema: z.object({ jobId: z.string().uuid() }),
		},
		async ({ jobId }) =>
			jsonText(
				await requestJson({
					path: `/api/server-render/jobs/${jobId}`,
					requiresToken: false,
				}),
			),
	);

	return server;
}

