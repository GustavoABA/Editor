import type { EditorCore } from "@/core";
import { extractTimelineAudio } from "@/media/mediabunny";
import { mediaTimeFromSeconds } from "@/wasm";
import { AUTO_CUT_PRESETS } from "./presets";
import type {
	AutoCutAnalysis,
	AutoCutPresetId,
	AutoCutTimeRange,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimeRange(value: unknown): value is AutoCutTimeRange {
	return (
		isRecord(value) &&
		typeof value.startSeconds === "number" &&
		typeof value.endSeconds === "number" &&
		Number.isFinite(value.startSeconds) &&
		Number.isFinite(value.endSeconds) &&
		value.endSeconds > value.startSeconds
	);
}

function parseAnalysis(value: unknown): AutoCutAnalysis {
	if (
		!isRecord(value) ||
		!Array.isArray(value.cutRanges) ||
		!value.cutRanges.every(isTimeRange) ||
		!Array.isArray(value.keptRanges) ||
		!value.keptRanges.every(isTimeRange) ||
		typeof value.totalDurationSeconds !== "number" ||
		typeof value.removedDurationSeconds !== "number" ||
		typeof value.detectedSilenceCount !== "number"
	) {
		throw new Error("O servidor devolveu uma análise de Auto Cut inválida");
	}
	return {
		cutRanges: value.cutRanges,
		keptRanges: value.keptRanges,
		totalDurationSeconds: value.totalDurationSeconds,
		removedDurationSeconds: value.removedDurationSeconds,
		detectedSilenceCount: value.detectedSilenceCount,
	};
}

export async function analyzeTimelineForAutoCut({
	editor,
	preset,
	onProgress,
}: {
	editor: EditorCore;
	preset: AutoCutPresetId;
	onProgress?: (message: string) => void;
}): Promise<AutoCutAnalysis> {
	onProgress?.("Preparando o áudio da timeline…");
	const audio = await extractTimelineAudio({
		tracks: editor.scenes.getActiveScene().tracks,
		mediaAssets: editor.media.getAssets(),
		totalDuration: editor.timeline.getTotalDuration(),
	});

	onProgress?.("Detectando pausas no servidor…");
	const formData = new FormData();
	formData.append("audio", new File([audio], "timeline.wav", { type: audio.type }));
	formData.append("options", JSON.stringify(AUTO_CUT_PRESETS[preset].options));
	const response = await fetch("/api/auto-cut/analyze", {
		method: "POST",
		body: formData,
	});
	const payload: unknown = await response.json();
	if (!response.ok) {
		throw new Error(
			isRecord(payload) && typeof payload.error === "string"
				? payload.error
				: "Não foi possível analisar o áudio",
		);
	}
	return parseAnalysis(payload);
}

export function applyAutoCutAnalysis({
	editor,
	analysis,
}: {
	editor: EditorCore;
	analysis: AutoCutAnalysis;
}): void {
	editor.timeline.removeTimeRanges({
		ranges: analysis.cutRanges.map((range) => ({
			startTime: mediaTimeFromSeconds({ seconds: range.startSeconds }),
			endTime: mediaTimeFromSeconds({ seconds: range.endSeconds }),
		})),
	});
}

