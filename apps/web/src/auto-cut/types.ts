export type AutoCutPresetId = "gentle" | "balanced" | "dynamic";

export type AutoCutOptions = {
	thresholdDb: number;
	minSilenceMs: number;
	paddingMs: number;
	minClipMs: number;
};

export type AutoCutTimeRange = {
	startSeconds: number;
	endSeconds: number;
};

export type AutoCutAnalysis = {
	cutRanges: AutoCutTimeRange[];
	keptRanges: AutoCutTimeRange[];
	totalDurationSeconds: number;
	removedDurationSeconds: number;
	detectedSilenceCount: number;
};

