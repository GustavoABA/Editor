/* eslint-disable opencut/prefer-object-params -- Next.js route handlers require positional request and context parameters. */
import { NextResponse } from "next/server";
import { authorizeAutomationRequest } from "@/server-automation/auth";
import {
	readAutomationCommand,
	updateAutomationCommand,
	type AutomationCommandStatus,
} from "@/server-automation/store";

export const runtime = "nodejs";

function isUpdateStatus(value: unknown): value is AutomationCommandStatus {
	return value === "running" || value === "complete" || value === "failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ commandId: string }> },
) {
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
	const { commandId } = await params;
	const command = await readAutomationCommand({ commandId });
	if (!command) {
		return NextResponse.json(
			{ error: "Automation command not found" },
			{ status: 404 },
		);
	}
	return NextResponse.json({ command });
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ commandId: string }> },
) {
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
		!isUpdateStatus(payload.status) ||
		(payload.result !== undefined && !isRecord(payload.result)) ||
		(payload.error !== undefined && typeof payload.error !== "string")
	) {
		return NextResponse.json(
			{ error: "Invalid command update" },
			{ status: 400 },
		);
	}
	const { commandId } = await params;
	const command = await updateAutomationCommand({
		commandId,
		patch: {
			status: payload.status,
			...(payload.result !== undefined ? { result: payload.result } : {}),
			...(typeof payload.error === "string" ? { error: payload.error } : {}),
		},
	});
	if (!command) {
		return NextResponse.json(
			{ error: "Automation command not found" },
			{ status: 404 },
		);
	}
	return NextResponse.json({ command });
}
