"use client";

import { useEffect } from "react";
import {
	analyzeTimelineForAutoCut,
	applyAutoCutAnalysis,
} from "@/auto-cut/service";
import type { AutoCutPresetId } from "@/auto-cut/types";
import type { EditorCore } from "@/core";
import type { ExportQuality } from "@/export";
import { createServerRenderJob } from "@/server-render/client";
import {
	CAPTION_PLACEMENT_VALUES,
	CAPTION_PRESET_VALUES,
	type CaptionPlacement,
	type CaptionPreset,
	updateExistingCaptionPresentation,
} from "@/subtitles/presets";
import { getElementsAtTime } from "@/timeline";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { getAutomationSessionId } from "@/automation/session";

type AutomationCommand = {
	id: string;
	type: string;
	payload: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAutomationCommand(value: unknown): value is AutomationCommand {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.type === "string" &&
		isRecord(value.payload)
	);
}

function buildSnapshot({ editor }: { editor: EditorCore }) {
	const project = editor.project.getActive();
	const scene = editor.scenes.getActiveScene();
	const tracks = [
		scene.tracks.main,
		...scene.tracks.overlay,
		...scene.tracks.audio,
	];
	return {
		project: {
			id: project.metadata.id,
			name: project.metadata.name,
			canvasSize: project.settings.canvasSize,
			fps: project.settings.fps,
		},
		scene: { id: scene.id, name: scene.name },
		durationSeconds: mediaTimeToSeconds({
			time: editor.timeline.getTotalDuration(),
		}),
		tracks: tracks.map((track) => ({
			id: track.id,
			name: track.name,
			type: track.type,
			elements: track.elements.map((element) => ({
				id: element.id,
				name: element.name,
				type: element.type,
				startSeconds: mediaTimeToSeconds({ time: element.startTime }),
				durationSeconds: mediaTimeToSeconds({ time: element.duration }),
				...(element.type === "text"
					? { content: String(element.params.content ?? "") }
					: {}),
			})),
		})),
		media: editor.media.getAssets().map((asset) => ({
			id: asset.id,
			name: asset.name,
			type: asset.type,
			durationSeconds: asset.duration,
		})),
	};
}

async function updateCommand({
	commandId,
	status,
	result,
	error,
}: {
	commandId: string;
	status: "running" | "complete" | "failed";
	result?: Record<string, unknown>;
	error?: string;
}): Promise<void> {
	await fetch(`/api/automation/commands/${commandId}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ status, result, error }),
	});
}

function requireString({
	payload,
	key,
}: {
	payload: Record<string, unknown>;
	key: string;
}): string {
	const value = payload[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Missing ${key}`);
	}
	return value;
}

function requireNumber({
	payload,
	key,
}: {
	payload: Record<string, unknown>;
	key: string;
}): number {
	const value = payload[key];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`Missing ${key}`);
	}
	return value;
}

function isAutoCutPresetId(value: string): value is AutoCutPresetId {
	return value === "gentle" || value === "balanced" || value === "dynamic";
}

function isCaptionPlacement(value: string): value is CaptionPlacement {
	return CAPTION_PLACEMENT_VALUES.some((placement) => placement === value);
}

function isCaptionPreset(value: string): value is CaptionPreset {
	return CAPTION_PRESET_VALUES.some((preset) => preset === value);
}

function isExportQuality(value: unknown): value is ExportQuality {
	return (
		value === "low" ||
		value === "medium" ||
		value === "high" ||
		value === "very_high"
	);
}

async function executeCommand({
	editor,
	command,
}: {
	editor: EditorCore;
	command: AutomationCommand;
}): Promise<Record<string, unknown>> {
	switch (command.type) {
		case "auto_cut": {
			const preset = requireString({ payload: command.payload, key: "preset" });
			if (!isAutoCutPresetId(preset)) {
				throw new Error("Invalid auto-cut preset");
			}
			const analysis = await analyzeTimelineForAutoCut({
				editor,
				preset,
			});
			applyAutoCutAnalysis({ editor, analysis });
			return {
				cuts: analysis.cutRanges.length,
				removedDurationSeconds: analysis.removedDurationSeconds,
			};
		}
		case "set_caption_style": {
			const placement = requireString({
				payload: command.payload,
				key: "placement",
			});
			const preset = requireString({ payload: command.payload, key: "preset" });
			if (!isCaptionPlacement(placement)) {
				throw new Error("Invalid caption placement");
			}
			if (!isCaptionPreset(preset)) {
				throw new Error("Invalid caption preset");
			}
			const updated = updateExistingCaptionPresentation({
				editor,
				placement,
				preset,
			});
			return { updated };
		}
		case "split_at": {
			const seconds = requireNumber({
				payload: command.payload,
				key: "seconds",
			});
			const splitTime = mediaTimeFromSeconds({ seconds });
			const elements = getElementsAtTime({
				tracks: editor.scenes.getActiveScene().tracks,
				time: splitTime,
			});
			editor.timeline.splitElements({ elements, splitTime });
			return { splitElements: elements.length };
		}
		case "delete_elements": {
			const rawElements = command.payload.elements;
			if (!Array.isArray(rawElements)) throw new Error("Missing elements");
			const elements = rawElements.flatMap((value) =>
				isRecord(value) &&
				typeof value.trackId === "string" &&
				typeof value.elementId === "string"
					? [{ trackId: value.trackId, elementId: value.elementId }]
					: [],
			);
			if (elements.length !== rawElements.length) {
				throw new Error("Invalid element references");
			}
			editor.timeline.deleteElements({ elements });
			return { deleted: elements.length };
		}
		case "update_text": {
			const trackId = requireString({
				payload: command.payload,
				key: "trackId",
			});
			const elementId = requireString({
				payload: command.payload,
				key: "elementId",
			});
			const content = requireString({
				payload: command.payload,
				key: "content",
			});
			const target = editor.timeline.getElementsWithTracks({
				elements: [{ trackId, elementId }],
			})[0];
			if (!target || target.element.type !== "text") {
				throw new Error("Text element not found");
			}
			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId,
						patch: {
							params: { ...target.element.params, content },
						},
					},
				],
			});
			return { updated: 1 };
		}
		case "undo":
			editor.command.undo();
			return { undone: true };
		case "redo":
			editor.command.redo();
			return { redone: true };
		case "export": {
			const format = command.payload.format === "webm" ? "webm" : "mp4";
			const requestedQuality = command.payload.quality;
			const quality = isExportQuality(requestedQuality)
				? requestedQuality
				: "high";
			const job = await createServerRenderJob({
				editor,
				format,
				quality,
				includeAudio: command.payload.includeAudio !== false,
				n8nWebhookPath:
					typeof command.payload.n8nWebhookPath === "string"
						? command.payload.n8nWebhookPath
						: undefined,
			});
			return job;
		}
		default:
			throw new Error(`Unsupported automation command: ${command.type}`);
	}
}

export function AutomationBridge() {
	const editor = useEditor();

	useEffect(() => {
		const sessionId = getAutomationSessionId();
		let cancelled = false;
		let isPolling = false;

		const heartbeat = async () => {
			const project = editor.project.getActiveOrNull();
			if (!project || cancelled) return;
			await fetch("/api/automation/sessions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					id: sessionId,
					projectId: project.metadata.id,
					projectName: project.metadata.name,
					url: window.location.href,
					snapshot: buildSnapshot({ editor }),
				}),
			});
		};

		const poll = async () => {
			if (cancelled || isPolling) return;
			isPolling = true;
			try {
				const response = await fetch(
					`/api/automation/commands?sessionId=${encodeURIComponent(sessionId)}`,
					{ cache: "no-store" },
				);
				const payload: unknown = await response.json();
				if (
					!response.ok ||
					!isRecord(payload) ||
					!Array.isArray(payload.commands)
				) {
					return;
				}
				for (const rawCommand of payload.commands) {
					if (!isAutomationCommand(rawCommand) || cancelled) continue;
					await updateCommand({ commandId: rawCommand.id, status: "running" });
					try {
						const result = await executeCommand({
							editor,
							command: rawCommand,
						});
						await updateCommand({
							commandId: rawCommand.id,
							status: "complete",
							result,
						});
						await heartbeat();
					} catch (error) {
						await updateCommand({
							commandId: rawCommand.id,
							status: "failed",
							error: error instanceof Error ? error.message : "Command failed",
						});
					}
				}
			} finally {
				isPolling = false;
			}
		};

		void heartbeat();
		void poll();
		const heartbeatTimer = window.setInterval(() => void heartbeat(), 3_000);
		const pollTimer = window.setInterval(() => void poll(), 1_000);
		return () => {
			cancelled = true;
			window.clearInterval(heartbeatTimer);
			window.clearInterval(pollTimer);
		};
	}, [editor]);

	return null;
}
