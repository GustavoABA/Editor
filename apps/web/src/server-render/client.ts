import type { EditorCore } from "@/core";
import type { ExportFormat, ExportQuality } from "@/export";

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
	const formData = new FormData();
	formData.append(
		"manifest",
		JSON.stringify({
			tracks: editor.scenes.getActiveScene().tracks,
			assets: mediaAssets.map((asset) => ({
				id: asset.id,
				name: asset.name,
				type: asset.type,
				mimeType: asset.file.type,
			})),
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
		formData.append(`asset:${asset.id}`, asset.file, asset.name);
	}

	const response = await fetch("/api/server-render/jobs", {
		method: "POST",
		body: formData,
		signal,
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

