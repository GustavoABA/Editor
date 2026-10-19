/* eslint-disable opencut/prefer-object-params -- Next.js route handlers require positional request and context parameters. */
import { NextResponse } from "next/server";
import { authorizeAutomationRequest } from "@/server-automation/auth";
import { readAutomationSession } from "@/server-automation/store";

export const runtime = "nodejs";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	const authorization = authorizeAutomationRequest({ request });
	if (!authorization.ok) {
		return NextResponse.json(
			{ error: authorization.error },
			{ status: authorization.status },
		);
	}
	const { sessionId } = await params;
	const session = await readAutomationSession({ sessionId });
	if (!session) {
		return NextResponse.json({ error: "Editor session not found" }, { status: 404 });
	}
	return NextResponse.json({ session });
}

