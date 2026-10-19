import { NextResponse } from "next/server";
import { authorizeAutomationRequest } from "@/server-automation/auth";
import {
	createAutomationCommand,
	listQueuedAutomationCommands,
	readAutomationSession,
} from "@/server-automation/store";

export const runtime = "nodejs";

const ALLOWED_COMMANDS = new Set([
	"auto_cut",
	"set_caption_style",
	"split_at",
	"delete_elements",
	"update_text",
	"undo",
	"redo",
	"export",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
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
	const sessionId = new URL(request.url).searchParams.get("sessionId");
	if (!sessionId) {
		return NextResponse.json({ error: "Missing session id" }, { status: 400 });
	}
	return NextResponse.json({
		commands: await listQueuedAutomationCommands({ sessionId }),
	});
}

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
	const payload: unknown = await request.json().catch(() => null);
	if (
		!isRecord(payload) ||
		typeof payload.sessionId !== "string" ||
		typeof payload.type !== "string" ||
		!ALLOWED_COMMANDS.has(payload.type) ||
		!isRecord(payload.payload)
	) {
		return NextResponse.json({ error: "Invalid automation command" }, { status: 400 });
	}
	const session = await readAutomationSession({ sessionId: payload.sessionId });
	if (!session) {
		return NextResponse.json({ error: "Editor session not found" }, { status: 404 });
	}
	const command = await createAutomationCommand({
		sessionId: payload.sessionId,
		type: payload.type,
		payload: payload.payload,
	});
	return NextResponse.json({ command }, { status: 201 });
}

