"use client";

import { useEffect, useState } from "react";
import { createTimelineAudioBuffer } from "@/media/audio";
import type { MediaAsset } from "@/media/types";
import { buildScene } from "@/services/renderer/scene-builder";
import { SceneExporter } from "@/services/renderer/scene-exporter";
import { initializeGpuRenderer } from "@/services/renderer/gpu-renderer";
import type { FrameRate } from "opencut-wasm";
import type { TBackground, TCanvasSize } from "@/project/types";
import type { SceneTracks } from "@/timeline";

type Manifest = {
	tracks: SceneTracks;
	assets: Array<{
		id: string;
		name: string;
		type: MediaAsset["type"];
		mimeType?: string;
	}>;
	duration: number;
	settings: {
		canvasSize: TCanvasSize;
		background: TBackground;
		fps: FrameRate;
	};
	options: {
		format: "mp4" | "webm";
		quality: "low" | "medium" | "high" | "very_high";
		includeAudio: boolean;
	};
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isManifestAsset(
	value: unknown,
): value is Manifest["assets"][number] {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		(value.type === "image" ||
			value.type === "video" ||
			value.type === "audio") &&
		(value.mimeType === undefined || typeof value.mimeType === "string")
	);
}

function isSceneTracks(value: unknown): value is SceneTracks {
	return (
		isRecord(value) &&
		Array.isArray(value.overlay) &&
		isRecord(value.main) &&
		Array.isArray(value.audio)
	);
}

function isBackground(value: unknown): value is TBackground {
	if (!isRecord(value)) return false;
	if (value.type === "color") return typeof value.color === "string";
	if (value.type === "blur") return typeof value.blurIntensity === "number";
	return false;
}

function isManifest(value: unknown): value is Manifest {
	if (!isRecord(value)) return false;
	if (!Array.isArray(value.assets) || !value.assets.every(isManifestAsset)) {
		return false;
	}
	if (!isRecord(value.settings) || !isRecord(value.options)) return false;
	const { canvasSize, background, fps } = value.settings;
	return (
		isSceneTracks(value.tracks) &&
		typeof value.duration === "number" &&
		isRecord(canvasSize) &&
		typeof canvasSize.width === "number" &&
		typeof canvasSize.height === "number" &&
		isBackground(background) &&
		isRecord(fps) &&
		typeof fps.numerator === "number" &&
		typeof fps.denominator === "number" &&
		(value.options.format === "mp4" || value.options.format === "webm") &&
		(value.options.quality === "low" ||
			value.options.quality === "medium" ||
			value.options.quality === "high" ||
			value.options.quality === "very_high") &&
		typeof value.options.includeAudio === "boolean"
	);
}

function isManifestResponse(value: unknown): value is { manifest: Manifest } {
	return isRecord(value) && isManifest(value.manifest);
}

export function ServerRenderRunner({ jobId }: { jobId: string }) {
	const [message, setMessage] = useState("Preparing server render…");

	useEffect(() => {
		const run = async () => {
			let phase = "starting";
			const timeout = window.setTimeout(
				() => {
					void fetch(`/api/server-render/jobs/${jobId}/complete`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							error: "Server render timed out after 10 minutes",
						}),
					});
					window.close();
				},
				10 * 60 * 1000,
			);
			try {
				console.info("OpenCut server renderer started", { jobId });
				phase = "initializing renderer";
				await initializeGpuRenderer();
				phase = "loading project";
				const response = await fetch(
					`/api/server-render/jobs/${jobId}?includeManifest=1`,
				);
				const payload: unknown = await response.json();
				if (!response.ok || !isManifestResponse(payload)) {
					throw new Error("Server returned an invalid render manifest");
				}
				const manifest = payload.manifest;
				phase = "loading media";
				const mediaAssets = await Promise.all(
					manifest.assets.map(async (asset) => {
						const response = await fetch(
							`/api/server-render/jobs/${jobId}/file/${asset.id}`,
						);
						if (!response.ok)
							throw new Error(`Missing media file: ${asset.name}`);
						const blob = await response.blob();
						const file = new File([blob], asset.name, {
							type: asset.mimeType || blob.type,
						});
						const mediaAsset: MediaAsset = {
							id: asset.id,
							name: asset.name,
							type: asset.type,
							file,
							url: URL.createObjectURL(file),
						};
						return mediaAsset;
					}),
				);

				setMessage("Rendering on the server…");
				phase = "preparing audio";
				const audioBuffer = manifest.options.includeAudio
					? await createTimelineAudioBuffer({
							tracks: manifest.tracks,
							mediaAssets,
							duration: manifest.duration,
						})
					: null;
				phase = "building scene";
				const scene = buildScene({
					tracks: manifest.tracks,
					mediaAssets,
					duration: manifest.duration,
					canvasSize: manifest.settings.canvasSize,
					background: manifest.settings.background,
				});
				const renderFormat =
					manifest.options.format === "mp4" && manifest.options.includeAudio
						? "webm"
						: manifest.options.format;
				const exporter = new SceneExporter({
					width: manifest.settings.canvasSize.width,
					height: manifest.settings.canvasSize.height,
					fps: manifest.settings.fps,
					format: renderFormat,
					quality: manifest.options.quality,
					shouldIncludeAudio: manifest.options.includeAudio,
					audioBuffer: audioBuffer ?? undefined,
				});
				let lastReportedProgress = -1;
				exporter.on("progress", (progress) => {
					const percent = Math.floor(progress * 100);
					if (percent === lastReportedProgress) return;
					lastReportedProgress = percent;
					void fetch(`/api/server-render/jobs/${jobId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ progress }),
					});
				});
				phase = "rendering frames";
				const buffer = await exporter.export({ rootNode: scene });
				if (!buffer) throw new Error("Renderer did not produce a video file");
				console.info("OpenCut server renderer produced video", {
					jobId,
					bytes: buffer.byteLength,
				});
				phase = "saving video";
				const completed = await fetch(
					`/api/server-render/jobs/${jobId}/complete`,
					{
						method: "POST",
						headers: { "X-OpenCut-Rendered-Format": renderFormat },
						body: buffer,
					},
				);
				if (!completed.ok)
					throw new Error("Server could not save the rendered video");
				window.clearTimeout(timeout);
				setMessage("Render complete");
				window.close();
			} catch (error) {
				window.clearTimeout(timeout);
				const detail =
					error instanceof Error
						? `${error.name}: ${error.message}${error.stack ? ` (${error.stack})` : ""}`
						: typeof error === "string"
							? error
							: JSON.stringify(error);
				const message = `${phase}: ${detail}`;
				console.error("OpenCut server renderer failed", {
					jobId,
					error: message,
				});
				await fetch(`/api/server-render/jobs/${jobId}/complete`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ error: message }),
				});
				setMessage(message);
				window.close();
			}
		};
		void run();
	}, [jobId]);

	return <main>{message}</main>;
}
