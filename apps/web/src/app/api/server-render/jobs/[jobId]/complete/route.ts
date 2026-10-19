/* eslint-disable opencut/prefer-object-params -- Next.js route handlers require positional request and context parameters. */
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { getJobDirectory, readJob, updateJob } from "@/server-render/jobs";
import {
	deliverRenderToN8n,
	validateN8nWebhookPath,
} from "@/integrations/n8n-delivery";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function transcodeToMp4({ input, output }: { input: string; output: string }) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", [
			"-y",
			"-i",
			input,
			"-c:v",
			"libx264",
			"-c:a",
			"aac",
			"-movflags",
			"+faststart",
			output,
		]);
		child.once("error", reject);
		child.once("close", (code) =>
			code === 0
				? resolve()
				: reject(new Error("FFmpeg could not create the MP4 file")),
		);
	});
}

async function writeRequestBody({
	request,
	filePath,
}: {
	request: Request;
	filePath: string;
}) {
	if (!request.body) throw new Error("Renderer returned an empty file");
	const input = Readable.fromWeb(
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Node and DOM expose the same Web Streams object with incompatible declaration packages.
		request.body as unknown as NodeReadableStream,
	);
	await pipeline(input, createWriteStream(filePath));
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;
	const job = await readJob({ jobId });
	if (!job)
		return NextResponse.json(
			{ error: "Render job not found" },
			{ status: 404 },
		);
	if (job.status === "cancelled") {
		return NextResponse.json(
			{ error: "Render job was cancelled" },
			{ status: 409 },
		);
	}
	const format =
		isRecord(job.manifest.options) && job.manifest.options.format === "mp4"
			? "mp4"
			: "webm";
	const renderedFormat =
		request.headers.get("X-OpenCut-Rendered-Format") === "webm"
			? "webm"
			: "mp4";
	const outputFile = `render.${format}`;
	const outputPath = `${getJobDirectory({ jobId })}/${outputFile}`;
	if (format === "mp4" && renderedFormat === "webm") {
		const temporaryInput = `${getJobDirectory({ jobId })}/render-source.webm`;
		await writeRequestBody({ request, filePath: temporaryInput });
		await transcodeToMp4({ input: temporaryInput, output: outputPath });
		await rm(temporaryInput, { force: true });
	} else {
		await writeRequestBody({ request, filePath: outputPath });
	}
	let deliveries:
		| {
				n8n?: { status: "complete" | "failed"; error?: string };
		  }
		| undefined;
	const integrations = isRecord(job.manifest.integrations)
		? job.manifest.integrations
		: null;
	const n8n = isRecord(integrations?.n8n) ? integrations.n8n : null;
	const webhookPath = validateN8nWebhookPath(n8n?.webhookPath);
	if (webhookPath) {
		try {
			await deliverRenderToN8n({
				webhookPath,
				filePath: outputPath,
				fileName: outputFile,
				jobId,
				clientOrigin:
					typeof job.manifest.clientOrigin === "string"
						? job.manifest.clientOrigin
						: undefined,
			});
			deliveries = { n8n: { status: "complete" } };
		} catch (error) {
			deliveries = {
				n8n: {
					status: "failed",
					error: error instanceof Error ? error.message : "n8n delivery failed",
				},
			};
		}
	}
	await updateJob({
		jobId,
		patch: { status: "complete", progress: 1, outputFile, deliveries },
	});
	return NextResponse.json({ ok: true });
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;
	const job = await readJob({ jobId });
	if (!job)
		return NextResponse.json(
			{ error: "Render job not found" },
			{ status: 404 },
		);
	if (job.status === "cancelled") return NextResponse.json({ ok: true });
	const payload: unknown = await request.json().catch(() => ({}));
	await updateJob({
		jobId,
		patch: {
			status: "failed",
			error:
				isRecord(payload) && typeof payload.error === "string"
					? payload.error
					: "Server render failed",
		},
	});
	return NextResponse.json({ ok: true });
}
