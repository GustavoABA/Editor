import { NextResponse } from "next/server";
import { authorizeAutomationRequest } from "@/server-automation/auth";
import {
	listAutomationSessions,
	upsertAutomationSession,
} from "@/server-automation/store";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
	const authorization = authorizeAutomationRequest({ request });
	if (!authorization.ok) {
		return NextResponse.json(
			{ error: authorization.error },
			{ status: authorization.status },
		);
	}
	return NextResponse.json({ sessions: await listAutomationSessions() });
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
		typeof payload.id !== "string" ||
		typeof payload.projectId !== "string" ||
		typeof payload.projectName !== "string" ||
		typeof payload.url !== "string" ||
		!isRecord(payload.snapshot)
	) {
		return NextResponse.json({ error: "Invalid editor session" }, { status: 400 });
	}
	const session = await upsertAutomationSession({
		session: {
			id: payload.id,
			projectId: payload.projectId,
			projectName: payload.projectName,
			url: payload.url,
			snapshot: payload.snapshot,
		},
	});
	return NextResponse.json({ session });
}

