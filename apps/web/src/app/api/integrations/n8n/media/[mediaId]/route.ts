/* eslint-disable opencut/prefer-object-params -- Next.js route handlers require positional request and context parameters. */
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import {
	getN8nInboxFileSize,
	markN8nInboxMediaImported,
	mediaFilePath,
	readN8nInboxMedia,
} from "@/integrations/n8n-media";
import { authorizeAutomationRequest } from "@/server-automation/auth";

export const runtime = "nodejs";

function contentDisposition(name: string): string {
	return `inline; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ mediaId: string }> },
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
	const { mediaId } = await params;
	const media = await readN8nInboxMedia({ mediaId });
	if (!media) return new Response("Media not found", { status: 404 });
	try {
		const size = await getN8nInboxFileSize({ mediaId });
		const bytes = new Uint8Array(await readFile(mediaFilePath(mediaId)));
		return new Response(bytes, {
			headers: {
				"Content-Type": media.mimeType,
				"Content-Length": String(size),
				"Content-Disposition": contentDisposition(media.name),
				"Cache-Control": "private, no-store",
			},
		});
	} catch {
		return new Response("Media file not found", { status: 404 });
	}
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ mediaId: string }> },
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
	const { mediaId } = await params;
	const media = await markN8nInboxMediaImported({ mediaId });
	if (!media) {
		return NextResponse.json({ error: "Media not found" }, { status: 404 });
	}
	return NextResponse.json({ media });
}
