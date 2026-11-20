import type { EditorCore } from "@/core";
import type { ExportFormat, ExportQuality } from "@/export";
import { getLanToken, lanRequest, readRemoteProject } from "@/lan-sync/client";
import { hasMediaId } from "@/timeline";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createServerRenderJob({
	editor,
	format,
	quality,
	includeAudio,
	n8nWebhookPath,
	signal,
}: {
	editor: EditorCore;
	format: ExportFormat;
	quality: ExportQuality;
	includeAudio: boolean;
	n8nWebhookPath?: string;
	signal?: AbortSignal;
}): Promise<{ jobId: string; statusUrl: string }> {
	const project = editor.project.getActive();
	const mediaAssets = editor.media.getAssets();
	// Reuse verified host originals whenever available; retain the old upload
	// path for unsynced assets and installations with LAN sync disabled.
	const token = getLanToken();
	const hosted = new Set<string>();
	const sceneTracks = editor.scenes.getActiveScene().tracks;
	const requiredIds = new Set([
		sceneTracks.main, ...sceneTracks.overlay, ...sceneTracks.audio,
	].flatMap((track) => track.elements.flatMap((element) => hasMediaId(element) ? [element.mediaId] : [])));
	const localIds = new Set(mediaAssets.map((asset) => asset.id));
	const absentIds = [...requiredIds].filter((id) => !localIds.has(id));
	const remoteOnly: Array<{ id: string; name: string; type: "video" | "image" | "audio"; mimeType: string; size: number }> = [];
	if (absentIds.length) {
		if (!token) throw new Error("Há arquivos ausentes deste dispositivo. Conecte a LAN para exportar usando os originais do servidor.");
		const remote = await readRemoteProject(project.metadata.id);
		for (const id of absentIds) {
			const asset = remote?.assets.find((entry) => entry.id === id && entry.uploaded);
			if (!asset || !["video", "image", "audio"].includes(asset.type)) {
				throw new Error(`Não é possível exportar: o original ${id} ainda não foi enviado ao servidor.`);
			}
			remoteOnly.push({
				id: asset.id, name: asset.name,
				type: asset.type as "video" | "image" | "audio",
				mimeType: asset.mimeType || "application/octet-stream", size: asset.size,
			});
			hosted.add(asset.id);
		}
	}
	if (token) {
		await Promise.all(mediaAssets.map(async (asset) => {
			try {
				const response = await lanRequest(
					`projects/${encodeURIComponent(project.metadata.id)}/assets/${encodeURIComponent(asset.id)}`,
				);
				const result = await response.json() as { uploaded: boolean; info?: { size: number } };
				if (result.uploaded && result.info?.size === asset.file.size) hosted.add(asset.id);
			} catch { /* Default to original upload when LAN sync is not available. */ }
		}));
	}
	const formData = new FormData();
	formData.append(
		"manifest",
		JSON.stringify({
			tracks: editor.scenes.getActiveScene().tracks,
			assets: [
				...mediaAssets.map((asset) => ({
					id: asset.id,
					name: asset.name,
					type: asset.type,
					mimeType: asset.file.type,
					size: asset.file.size,
				})),
				...remoteOnly,
			],
			...(hosted.size > 0 ? { lanSyncProjectId: project.metadata.id } : {}),
			duration: editor.timeline.getTotalDuration(),
			settings: project.settings,
			options: { format, quality, includeAudio },
			clientOrigin: window.location.origin,
			...(n8nWebhookPath
				? { integrations: { n8n: { webhookPath: n8nWebhookPath } } }
				: {}),
		}),
	);
	for (const asset of mediaAssets) {
		if (!hosted.has(asset.id)) formData.append(`asset:${asset.id}`, asset.file, asset.name);
	}

	const response = await fetch("/api/server-render/jobs", {
		method: "POST",
		body: formData,
		signal,
		...(hosted.size > 0 ? { headers: { "x-lan-sync-token": token } } : {}),
	});
	const payload: unknown = await response.json();
	if (!response.ok) {
		throw new Error(
			isRecord(payload) && typeof payload.error === "string"
				? payload.error
				: "Could not start server render",
		);
	}
	if (!isRecord(payload) || typeof payload.jobId !== "string") {
		throw new Error("Server returned an invalid render job");
	}
	return {
		jobId: payload.jobId,
		statusUrl: `/render/${payload.jobId}`,
	};
}

