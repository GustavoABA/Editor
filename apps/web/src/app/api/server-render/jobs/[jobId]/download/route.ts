/* eslint-disable opencut/prefer-object-params -- Next.js route handlers require positional request and context parameters. */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { readJob, getJobDirectory } from "@/server-render/jobs";

export const runtime = "nodejs";

export async function GET(
	_: Request,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;
	const job = await readJob({ jobId });
	if (!job?.outputFile)
		return new Response("Render not ready", { status: 404 });
	try {
		const filePath = `${getJobDirectory({ jobId })}/${job.outputFile}`;
		const fileStats = await stat(filePath);
		const nodeWebStream = Readable.toWeb(createReadStream(filePath));
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Node and DOM expose the same Web Streams object with incompatible declaration packages.
		const body = nodeWebStream as unknown as ReadableStream;
		const isMp4 = job.outputFile.endsWith(".mp4");
		return new Response(body, {
			headers: {
				"Content-Type": isMp4 ? "video/mp4" : "video/webm",
				"Content-Length": String(fileStats.size),
				"Content-Disposition": `attachment; filename="render.${isMp4 ? "mp4" : "webm"}"`,
				"Cache-Control": "private, no-store",
			},
		});
	} catch {
		return new Response("Render not found", { status: 404 });
	}
}
