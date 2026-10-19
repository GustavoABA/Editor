/* eslint-disable opencut/prefer-object-params -- Next.js route handlers require positional request and context parameters. */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getAssetPath, readJob } from "@/server-render/jobs";

export const runtime = "nodejs";

interface RenderAssetEntry {
	id: string;
	name: string;
	mimeType?: string;
}

function isRenderAssetEntry(value: unknown): value is RenderAssetEntry {
	if (typeof value !== "object" || value === null) return false;
	if (!("id" in value) || typeof value.id !== "string") return false;
	if (!("name" in value) || typeof value.name !== "string") return false;
	return (
		!("mimeType" in value) ||
		value.mimeType === undefined ||
		typeof value.mimeType === "string"
	);
}

export async function GET(
	_: Request,
	{ params }: { params: Promise<{ jobId: string; assetId: string }> },
) {
	const { jobId, assetId } = await params;
	const job = await readJob({ jobId });
	if (!job) return new Response("Not found", { status: 404 });
	const asset = (
		Array.isArray(job.manifest.assets) ? job.manifest.assets : []
	).find((value) => isRenderAssetEntry(value) && value.id === assetId);
	if (!asset) return new Response("Not found", { status: 404 });
	try {
		const filePath = getAssetPath({ jobId, assetId, name: asset.name });
		const fileStats = await stat(filePath);
		const nodeWebStream = Readable.toWeb(createReadStream(filePath));
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Node and DOM expose the same Web Streams object with incompatible declaration packages.
		const body = nodeWebStream as unknown as ReadableStream;
		return new Response(body, {
			headers: {
				"Content-Type": asset.mimeType ?? "application/octet-stream",
				"Content-Length": String(fileStats.size),
			},
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
}
