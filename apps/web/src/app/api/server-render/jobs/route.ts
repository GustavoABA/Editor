import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import {
	createRenderJob,
	getAssetPath,
	getJobDirectory,
	updateJob,
} from "@/server-render/jobs";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function startRunner({ jobId }: { jobId: string }) {
	await updateJob({ jobId, patch: { status: "rendering", error: undefined } });
	const url = `http://127.0.0.1:3000/server-render/${jobId}`;
	const log = await open(`${getJobDirectory({ jobId })}/runner.log`, "a");
	const child = spawn(
		process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser",
		[
			"--headless=new",
			`--user-data-dir=${getJobDirectory({ jobId })}/browser-profile`,
			"--no-first-run",
			"--no-default-browser-check",
			"--no-sandbox",
			"--disable-dev-shm-usage",
			"--autoplay-policy=no-user-gesture-required",
			url,
		],
		{
			detached: true,
			stdio: ["ignore", log.fd, log.fd],
			env: { ...process.env, LIBGL_ALWAYS_SOFTWARE: "1" },
		},
	);
	if (child.pid) {
		await updateJob({ jobId, patch: { runnerPid: child.pid } });
	}
	child.on("error", (error) => {
		void updateJob({
			jobId,
			patch: {
				status: "failed",
				error: `Could not start renderer: ${error.message}`,
			},
		});
		void log.close();
	});
	child.on("close", (code) => {
		void (async () => {
			const { readJob } = await import("@/server-render/jobs");
			const job = await readJob({ jobId });
			if (job?.status === "rendering") {
				await updateJob({
					jobId,
					patch: {
						status: "failed",
						error: `Renderer stopped before producing a file (exit code ${code ?? "unknown"}).`,
					},
				});
			}
			await log.close();
			await rm(`${getJobDirectory({ jobId })}/browser-profile`, {
				recursive: true,
				force: true,
			});
		})();
	});
	child.unref();
}

export async function POST(request: Request) {
	try {
		const formData = await request.formData();
		const rawManifest = formData.get("manifest");
		if (typeof rawManifest !== "string") {
			return NextResponse.json(
				{ error: "Missing render manifest" },
				{ status: 400 },
			);
		}
		const manifest: unknown = JSON.parse(rawManifest);
		if (!isRecord(manifest)) {
			return NextResponse.json(
				{ error: "Invalid render manifest" },
				{ status: 400 },
			);
		}
		const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
		const job = await createRenderJob({ manifest });
		await mkdir(`${getJobDirectory({ jobId: job.id })}/assets`, {
			recursive: true,
		});

		for (const asset of assets) {
			if (!isRecord(asset)) continue;
			const { id, name } = asset;
			if (typeof id !== "string" || typeof name !== "string") continue;
			const upload = formData.get(`asset:${id}`);
			if (!(upload instanceof File)) {
				return NextResponse.json(
					{ error: `Missing media file: ${name}` },
					{ status: 400 },
				);
			}
			await writeFile(
				getAssetPath({ jobId: job.id, assetId: id, name }),
				Buffer.from(await upload.arrayBuffer()),
			);
		}

		await startRunner({ jobId: job.id });
		return NextResponse.json({ jobId: job.id });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Unable to create render job",
			},
			{ status: 500 },
		);
	}
}
