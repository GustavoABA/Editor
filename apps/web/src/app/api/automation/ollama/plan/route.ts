import { NextResponse } from "next/server";
import { authorizeAutomationRequest } from "@/server-automation/auth";
import { readAutomationSession } from "@/server-automation/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLANNED_COMMAND_TYPES = new Set([
	"auto_cut",
	"set_caption_style",
	"split_at",
	"delete_elements",
	"update_text",
	"undo",
	"redo",
]);

type PlannedCommand = {
	type: string;
	payload: Record<string, unknown>;
};

type SnapshotElement = {
	trackId: string;
	type: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isElementReference(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.trackId === "string" &&
		typeof value.elementId === "string"
	);
}

function parseCommand(value: unknown): PlannedCommand | null {
	if (
		!isRecord(value) ||
		typeof value.type !== "string" ||
		!PLANNED_COMMAND_TYPES.has(value.type) ||
		!isRecord(value.payload)
	) {
		return null;
	}
	const payload = value.payload;
	switch (value.type) {
		case "auto_cut":
			return ["gentle", "balanced", "dynamic"].includes(
				String(payload.preset),
			)
				? { type: value.type, payload: { preset: payload.preset } }
				: null;
		case "set_caption_style":
			return ["top", "middle", "bottom"].includes(
				String(payload.placement),
			) && ["clean", "box", "social"].includes(String(payload.preset))
				? {
						type: value.type,
						payload: {
							placement: payload.placement,
							preset: payload.preset,
						},
					}
				: null;
		case "split_at":
			return typeof payload.seconds === "number" &&
				Number.isFinite(payload.seconds) &&
				payload.seconds >= 0
				? { type: value.type, payload: { seconds: payload.seconds } }
				: null;
		case "delete_elements":
			return Array.isArray(payload.elements) &&
				payload.elements.length > 0 &&
				payload.elements.every(isElementReference)
				? { type: value.type, payload: { elements: payload.elements } }
				: null;
		case "update_text":
			return typeof payload.trackId === "string" &&
				typeof payload.elementId === "string" &&
				typeof payload.content === "string" &&
				payload.content.length > 0
				? {
						type: value.type,
						payload: {
							trackId: payload.trackId,
							elementId: payload.elementId,
							content: payload.content,
						},
					}
				: null;
		case "undo":
		case "redo":
			return { type: value.type, payload: {} };
		default:
			return null;
	}
}

function buildElementIndex(snapshot: Record<string, unknown>): Map<string, SnapshotElement> {
	const index = new Map<string, SnapshotElement>();
	if (!Array.isArray(snapshot.tracks)) return index;
	for (const rawTrack of snapshot.tracks) {
		if (!isRecord(rawTrack) || typeof rawTrack.id !== "string") continue;
		if (!Array.isArray(rawTrack.elements)) continue;
		for (const rawElement of rawTrack.elements) {
			if (
				isRecord(rawElement) &&
				typeof rawElement.id === "string" &&
				typeof rawElement.type === "string"
			) {
				index.set(rawElement.id, {
					trackId: rawTrack.id,
					type: rawElement.type,
				});
			}
		}
	}
	return index;
}

function reconcileCommand({
	command,
	elements,
}: {
	command: PlannedCommand;
	elements: Map<string, SnapshotElement>;
}): PlannedCommand | null {
	if (command.type === "update_text") {
		const elementId = command.payload.elementId;
		if (typeof elementId !== "string") return null;
		const element = elements.get(elementId);
		if (!element || element.type !== "text") return null;
		return {
			...command,
			payload: { ...command.payload, trackId: element.trackId },
		};
	}
	if (command.type === "delete_elements") {
		const references = command.payload.elements;
		if (!Array.isArray(references)) return null;
		const resolved = references.flatMap((reference) => {
			if (!isRecord(reference) || typeof reference.elementId !== "string") {
				return [];
			}
			const element = elements.get(reference.elementId);
			return element
				? [{ trackId: element.trackId, elementId: reference.elementId }]
				: [];
		});
		return resolved.length === references.length
			? { ...command, payload: { elements: resolved } }
			: null;
	}
	return command;
}

const planSchema = {
	type: "object",
	properties: {
		summary: { type: "string" },
		commands: {
			type: "array",
			maxItems: 12,
			items: {
				type: "object",
				properties: {
					type: {
						type: "string",
						enum: [...PLANNED_COMMAND_TYPES],
					},
					payload: { type: "object" },
				},
				required: ["type", "payload"],
				additionalProperties: false,
			},
		},
	},
	required: ["summary", "commands"],
	additionalProperties: false,
} as const;

export async function POST(request: Request) {
	const authorization = authorizeAutomationRequest({
		request,
		allowSameOrigin: true,
	});
	if (!authorization.ok) {
		return NextResponse.json(
			{ error: authorization.error },
			{ status: authorization.status },
		);
	}
	const body: unknown = await request.json().catch(() => null);
	if (
		!isRecord(body) ||
		typeof body.sessionId !== "string" ||
		typeof body.instruction !== "string" ||
		body.instruction.trim().length < 3 ||
		body.instruction.length > 2_000
	) {
		return NextResponse.json({ error: "Invalid editing request" }, { status: 400 });
	}
	const session = await readAutomationSession({ sessionId: body.sessionId });
	if (!session) {
		return NextResponse.json(
			{ error: "Editor session not found. Keep the editor tab open." },
			{ status: 404 },
		);
	}

	const ollamaBase = (
		process.env.OLLAMA_BASE_URL ?? "http://host.docker.internal:11434"
	).replace(/\/$/, "");
	const model = process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b";
	const snapshot = JSON.stringify(session.snapshot).slice(0, 120_000);
	const response = await fetch(`${ollamaBase}/api/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model,
			stream: false,
			format: planSchema,
			options: { temperature: 0 },
			messages: [
				{
					role: "system",
					content:
						"Você é um assistente de edição do OpenCut Classic. Gere somente um plano executável usando os comandos permitidos. Nunca invente trackId ou elementId: copie-os do snapshot. Prefira poucas alterações úteis. auto_cut usa preset gentle, balanced ou dynamic. set_caption_style usa placement top, middle ou bottom e preset clean, box ou social. split_at usa seconds. delete_elements recebe elements com trackId e elementId. update_text recebe trackId, elementId e content. undo e redo usam payload vazio. Não exporte, não apague mídia e não faça operações fora do pedido.",
				},
				{
					role: "user",
					content: `Pedido de edição:\n${body.instruction.trim()}\n\nSnapshot atual:\n${snapshot}`,
				},
			],
		}),
		signal: AbortSignal.timeout(90_000),
	});
	const ollamaPayload: unknown = await response.json().catch(() => null);
	if (!response.ok || !isRecord(ollamaPayload)) {
		return NextResponse.json(
			{ error: "Ollama could not create an editing plan" },
			{ status: 502 },
		);
	}
	const message = ollamaPayload.message;
	const content = isRecord(message) ? message.content : null;
	if (typeof content !== "string") {
		return NextResponse.json({ error: "Ollama returned no plan" }, { status: 502 });
	}
	let rawPlan: unknown;
	try {
		rawPlan = JSON.parse(content) as unknown;
	} catch {
		return NextResponse.json({ error: "Ollama returned invalid JSON" }, { status: 502 });
	}
	if (
		!isRecord(rawPlan) ||
		typeof rawPlan.summary !== "string" ||
		!Array.isArray(rawPlan.commands)
	) {
		return NextResponse.json({ error: "Ollama returned an invalid plan" }, { status: 502 });
	}
	const elementIndex = buildElementIndex(session.snapshot);
	const commands = rawPlan.commands.slice(0, 12).flatMap((command) => {
		const parsed = parseCommand(command);
		if (!parsed) return [];
		const reconciled = reconcileCommand({ command: parsed, elements: elementIndex });
		return reconciled ? [reconciled] : [];
	});
	return NextResponse.json({
		model,
		summary: rawPlan.summary,
		commands,
	});
}
