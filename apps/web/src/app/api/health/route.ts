import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { ensureJobsRoot, getJobsRoot } from "@/server-render/jobs";

export const runtime = "nodejs";

async function isExecutable({ path }: { path: string }) {
	try {
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export async function GET() {
	let storage = false;
	try {
		await ensureJobsRoot();
		storage = true;
	} catch {
		storage = false;
	}
	const chromiumPath = process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser";
	const ffmpegPath = process.env.FFMPEG_PATH ?? "/usr/bin/ffmpeg";
	const [chromium, ffmpeg] = await Promise.all([
		isExecutable({ path: chromiumPath }),
		isExecutable({ path: ffmpegPath }),
	]);
	const ready = storage && chromium && ffmpeg;
	return Response.json(
		{
			status: ready ? "ok" : "degraded",
			renderer: { storage, chromium, ffmpeg },
			storagePath: getJobsRoot(),
		},
		{ status: ready ? 200 : 503 },
	);
}
