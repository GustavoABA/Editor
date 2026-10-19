import { NextResponse } from "next/server";
import { listN8nInboxMedia, saveN8nInboxMedia } from "@/integrations/n8n-media";
import { authorizeAutomationRequest } from "@/server-automation/auth";

export const runtime = "nodejs";

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
	return NextResponse.json({ media: await listN8nInboxMedia() });
}

export async function POST(request: Request) {
	const authorization = authorizeAutomationRequest({ request });
	if (!authorization.ok) {
		return NextResponse.json(
			{ error: authorization.error },
			{ status: authorization.status },
		);
	}
	const formData = await request.formData();
	const file = formData.get("file") ?? formData.get("video");
	if (!(file instanceof File) || file.size <= 0) {
		return NextResponse.json({ error: "Missing media file" }, { status: 400 });
	}
	const media = await saveN8nInboxMedia({ file });
	return NextResponse.json(
		{
			media,
			downloadUrl: `/api/integrations/n8n/media/${media.id}`,
		},
		{ status: 201 },
	);
}

