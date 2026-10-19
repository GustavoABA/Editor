import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SAMPLE_RATE = 16_000;
const MAX_AUDIO_BYTES = 512 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 2 * 60 * 1000;

type AutoCutOptions = {
	thresholdDb: number;
	minSilenceMs: number;
	paddingMs: number;
	minClipMs: number;
};

type ChildResult = {
	stdout: Buffer;
	stderr: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber({
	value,
	min,
	max,
}: {
	value: unknown;
	min: number;
	max: number;
}): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	if (value < min || value > max) return null;
	return value;
}

function parseOptions(value: unknown): AutoCutOptions | null {
	if (!isRecord(value)) return null;
	const thresholdDb = parseNumber({ value: value.thresholdDb, min: -80, max: -6 });
	const minSilenceMs = parseNumber({
		value: value.minSilenceMs,
		min: 80,
		max: 10_000,
	});
	const paddingMs = parseNumber({ value: value.paddingMs, min: 0, max: 2_000 });
	const minClipMs = parseNumber({ value: value.minClipMs, min: 0, max: 10_000 });
	if (
		thresholdDb === null ||
		minSilenceMs === null ||
		paddingMs === null ||
		minClipMs === null
	) {
		return null;
	}
	return { thresholdDb, minSilenceMs, paddingMs, minClipMs };
}

function runProcess({
	command,
	args,
	input,
}: {
	command: string;
	args: string[];
	input: Buffer;
}): Promise<ChildResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["pipe", "pipe", "pipe"],
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		const timeout = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`${command} exceeded the processing time limit`));
		}, PROCESS_TIMEOUT_MS);

		child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
		child.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once("close", (code) => {
			clearTimeout(timeout);
			const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
			if (code !== 0) {
				reject(
					new Error(stderr || `${command} stopped with exit code ${code ?? "unknown"}`),
				);
				return;
			}
			resolve({ stdout: Buffer.concat(stdoutChunks), stderr });
		});
		child.stdin.once("error", (error) => reject(error));
		child.stdin.end(input);
	});
}

async function decodeAudio({ audio }: { audio: Buffer }): Promise<Buffer> {
	const result = await runProcess({
		command: process.env.FFMPEG_PATH ?? "ffmpeg",
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			"pipe:0",
			"-f",
			"f32le",
			"-acodec",
			"pcm_f32le",
			"-ac",
			"1",
			"-ar",
			String(SAMPLE_RATE),
			"pipe:1",
		],
		input: audio,
	});
	return result.stdout;
}

async function analyzePcm({
	pcm,
	options,
}: {
	pcm: Buffer;
	options: AutoCutOptions;
}): Promise<unknown> {
	const result = await runProcess({
		command: process.env.AUTOCUT_PATH ?? "/usr/local/bin/opencut-autocut",
		args: [
			"--sample-rate",
			String(SAMPLE_RATE),
			"--threshold-db",
			String(options.thresholdDb),
			"--min-silence-ms",
			String(options.minSilenceMs),
			"--padding-ms",
			String(options.paddingMs),
			"--min-clip-ms",
			String(options.minClipMs),
			"--window-ms",
			"20",
		],
		input: pcm,
	});
	return JSON.parse(result.stdout.toString("utf8")) as unknown;
}

export async function POST(request: Request) {
	try {
		const formData = await request.formData();
		const audio = formData.get("audio");
		const rawOptions = formData.get("options");
		if (!(audio instanceof File)) {
			return NextResponse.json({ error: "Missing timeline audio" }, { status: 400 });
		}
		if (audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) {
			return NextResponse.json(
				{ error: "Timeline audio is empty or too large" },
				{ status: 413 },
			);
		}
		if (typeof rawOptions !== "string") {
			return NextResponse.json({ error: "Missing auto-cut options" }, { status: 400 });
		}
		const options = parseOptions(JSON.parse(rawOptions) as unknown);
		if (!options) {
			return NextResponse.json({ error: "Invalid auto-cut options" }, { status: 400 });
		}

		const pcm = await decodeAudio({ audio: Buffer.from(await audio.arrayBuffer()) });
		const analysis = await analyzePcm({ pcm, options });
		return NextResponse.json(analysis);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not analyze timeline audio",
			},
			{ status: 500 },
		);
	}
}

