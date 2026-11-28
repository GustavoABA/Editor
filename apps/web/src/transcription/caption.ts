import type { TranscriptionSegment, CaptionChunk } from "@/transcription/types";
import {
	DEFAULT_WORDS_PER_CAPTION,
	MIN_CAPTION_DURATION_SECONDS,
} from "@/transcription/caption-defaults";

export function buildCaptionChunks({
	segments,
	wordsPerChunk = DEFAULT_WORDS_PER_CAPTION,
	minDuration = MIN_CAPTION_DURATION_SECONDS,
}: {
	segments: TranscriptionSegment[];
	wordsPerChunk?: number;
	minDuration?: number;
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];
	let globalEndTime = 0;

	for (const segment of segments) {
		const words = segment.text.trim().split(/\s+/);
		if (words.length === 0 || (words.length === 1 && words[0] === "")) continue;

		const segmentDuration = segment.end - segment.start;
		const wordsPerSecond = words.length / segmentDuration;

		const chunks: string[] = [];
		for (let i = 0; i < words.length; i += wordsPerChunk) {
			chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
		}

		let chunkStartTime = segment.start;
		for (const chunk of chunks) {
			const chunkWords = chunk.split(/\s+/).length;
			const chunkDuration = Math.max(minDuration, chunkWords / wordsPerSecond);
			const adjustedStartTime = Math.max(chunkStartTime, globalEndTime);

			captions.push({
				text: chunk,
				startTime: adjustedStartTime,
				duration: chunkDuration,
			});

			globalEndTime = adjustedStartTime + chunkDuration;
			chunkStartTime += chunkDuration;
		}
	}

	return captions;
}


/** Join adjacent word timestamps returned by the host before creating captions. */
export function groupTimedWords({ segments, wordsPerChunk }: { segments: TranscriptionSegment[]; wordsPerChunk: number }): TranscriptionSegment[] {
	const groups: TranscriptionSegment[] = [];
	const limit = Math.max(1, Math.floor(wordsPerChunk));
	let current: TranscriptionSegment | null = null;
	let count = 0;
	for (const segment of segments) {
		const text = segment.text.trim();
		if (!text || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.end < segment.start) continue;
		const words = text.split(/\s+/).length;
		if (!current || count + words > limit || segment.start - current.end > 0.8) {
			if (current) groups.push(current);
			current = { ...segment, text };
			count = words;
		} else {
			current = { text: current.text + " " + text, start: current.start, end: Math.max(current.end, segment.end) };
			count += words;
		}
	}
	if (current) groups.push(current);
	return groups;
}
