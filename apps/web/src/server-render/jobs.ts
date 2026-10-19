import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export type RenderJobStatus =
	| "queued"
	| "rendering"
	| "complete"
	| "failed"
	| "cancelled";

export type RenderJob = {
	id: string;
	status: RenderJobStatus;
	createdAt: string;
	updatedAt: string;
	progress: number;
	error?: string;
	outputFile?: string;
	runnerPid?: number;
	deliveries?: {
		n8n?: { status: "complete" | "failed"; error?: string };
	};
	manifest: Record<string, unknown>;
};

const jobsRoot = process.env.RENDER_JOBS_DIR ?? "/tmp/opencut-render-jobs";
const renderJobIdPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRenderJobStatus(value: unknown): value is RenderJobStatus {
	return (
		value === "queued" ||
		value === "rendering" ||
		value === "complete" ||
		value === "failed" ||
		value === "cancelled"
	);
}

function isRenderJob(value: unknown): value is RenderJob {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		renderJobIdPattern.test(value.id) &&
		isRenderJobStatus(value.status) &&
		typeof value.createdAt === "string" &&
		typeof value.updatedAt === "string" &&
		typeof value.progress === "number" &&
		isRecord(value.manifest) &&
		(value.error === undefined || typeof value.error === "string") &&
		(value.outputFile === undefined || typeof value.outputFile === "string") &&
		(value.runnerPid === undefined || typeof value.runnerPid === "number")
		&& (value.deliveries === undefined || isRecord(value.deliveries))
	);
}

export function getJobsRoot() {
	return jobsRoot;
}

export async function ensureJobsRoot() {
	await mkdir(jobsRoot, { recursive: true });
	await access(jobsRoot, constants.R_OK | constants.W_OK);
}

export function getJobDirectory({ jobId }: { jobId: string }) {
	if (!renderJobIdPattern.test(jobId)) {
		throw new Error("Invalid render job id");
	}
	return path.join(jobsRoot, jobId);
}

function getJobPath({ jobId }: { jobId: string }) {
	return path.join(getJobDirectory({ jobId }), "job.json");
}

export async function createRenderJob({
	manifest,
}: {
	manifest: Record<string, unknown>;
}): Promise<RenderJob> {
	await ensureJobsRoot();
	const id = randomUUID();
	const now = new Date().toISOString();
	const job: RenderJob = {
		id,
		status: "queued",
		createdAt: now,
		updatedAt: now,
		progress: 0,
		manifest,
	};
	await mkdir(getJobDirectory({ jobId: id }), { recursive: true });
	await writeJob({ job });
	return job;
}

export async function readJob({
	jobId,
}: {
	jobId: string;
}): Promise<RenderJob | null> {
	try {
		const parsed: unknown = JSON.parse(
			await readFile(getJobPath({ jobId }), "utf8"),
		);
		return isRenderJob(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export async function writeJob({ job }: { job: RenderJob }): Promise<void> {
	const nextJob = { ...job, updatedAt: new Date().toISOString() };
	await writeFile(
		getJobPath({ jobId: job.id }),
		JSON.stringify(nextJob),
		"utf8",
	);
}

export async function updateJob({
	jobId,
	patch,
}: {
	jobId: string;
	patch: Partial<Omit<RenderJob, "id" | "createdAt" | "manifest">>;
}): Promise<RenderJob | null> {
	const job = await readJob({ jobId });
	if (!job) return null;
	const nextJob = { ...job, ...patch, updatedAt: new Date().toISOString() };
	await writeFile(getJobPath({ jobId }), JSON.stringify(nextJob), "utf8");
	return nextJob;
}

export function getAssetPath({
	jobId,
	assetId,
	name,
}: {
	jobId: string;
	assetId: string;
	name: string;
}) {
	const safeAssetId = assetId.replace(/[^a-zA-Z0-9._-]/g, "_");
	const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
	return path.join(
		getJobDirectory({ jobId }),
		"assets",
		`${safeAssetId}-${safeName}`,
	);
}

export async function hasFile({
	filePath,
}: {
	filePath: string;
}): Promise<boolean> {
	try {
		await access(filePath, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}
