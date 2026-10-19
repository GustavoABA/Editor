/* eslint-disable opencut/prefer-object-params -- Next.js route handlers require positional request and context parameters. */
import { NextResponse } from "next/server";
import { readJob, updateJob } from "@/server-render/jobs";

export const runtime = "nodejs";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;
	let job = await readJob({ jobId });
	if (!job)
		return NextResponse.json(
			{ error: "Render job not found" },
			{ status: 404 },
		);
	if (job.status === "rendering" && job.runnerPid) {
		try {
			process.kill(job.runnerPid, 0);
		} catch {
			job =
				(await updateJob({
					jobId,
					patch: {
						status: "failed",
						error:
							"O processo de renderização foi interrompido. Tente exportar novamente.",
					},
				})) ?? job;
		}
	}
	const includeManifest =
		new URL(request.url).searchParams.get("includeManifest") === "1";
	return NextResponse.json({
		id: job.id,
		status: job.status,
		progress: job.progress ?? 0,
		error: job.error,
		...(includeManifest ? { manifest: job.manifest } : {}),
		downloadUrl:
			job.status === "complete"
				? `/api/server-render/jobs/${job.id}/download`
				: null,
		deliveries: job.deliveries,
	});
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;
	const currentJob = await readJob({ jobId });
	if (!currentJob)
		return NextResponse.json(
			{ error: "Render job not found" },
			{ status: 404 },
		);
	if (currentJob.status === "cancelled") {
		return NextResponse.json(
			{ error: "Render job was cancelled" },
			{ status: 409 },
		);
	}
	const payload = await request.json().catch(() => ({}));
	const progress =
		typeof payload.progress === "number"
			? Math.max(0, Math.min(1, payload.progress))
			: null;
	if (progress === null)
		return NextResponse.json({ error: "Invalid progress" }, { status: 400 });
	const job = await updateJob({
		jobId,
		patch: { status: "rendering", progress },
	});
	if (!job)
		return NextResponse.json(
			{ error: "Render job not found" },
			{ status: 404 },
		);
	return NextResponse.json({ ok: true });
}

export async function DELETE(
	_: Request,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;
	const job = await readJob({ jobId });
	if (!job)
		return NextResponse.json(
			{ error: "Render job not found" },
			{ status: 404 },
		);
	if (
		job.status === "complete" ||
		job.status === "failed" ||
		job.status === "cancelled"
	) {
		return NextResponse.json({ ok: true, status: job.status });
	}
	await updateJob({
		jobId,
		patch: { status: "cancelled", error: "Render cancelled by the user" },
	});
	if (
		job.runnerPid &&
		Number.isSafeInteger(job.runnerPid) &&
		job.runnerPid > 0
	) {
		try {
			process.kill(-job.runnerPid, "SIGTERM");
		} catch {
			try {
				process.kill(job.runnerPid, "SIGTERM");
			} catch {
				// The renderer may already have stopped between the status read and cancellation.
			}
		}
	}
	return NextResponse.json({ ok: true, status: "cancelled" });
}
