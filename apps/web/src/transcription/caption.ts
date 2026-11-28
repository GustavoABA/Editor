import type { TranscriptionSegment, CaptionChunk } from "@/transcription/types";
import { DEFAULT_WORDS_PER_CAPTION } from "@/transcription/caption-defaults";

/** Never stretch a cue past its recognized interval or the source audio. */
export function buildCaptionChunks({
	segments, wordsPerChunk = DEFAULT_WORDS_PER_CAPTION, maxEndSeconds = Infinity,
}: {
	segments: TranscriptionSegment[];
	wordsPerChunk?: number;
	maxEndSeconds?: number;
	/** Kept for existing callers; intentionally does not extend timestamps. */
	minDuration?: number;
}): CaptionChunk[] {
	const limit = Math.max(1, Math.floor(wordsPerChunk) || 1);
	const captions: CaptionChunk[] = [];
	let lastEnd = 0;
	for (const segment of [...segments].sort((a,b) => a.start-b.start)) {
		const words = segment.text.trim().split(/\s+/).filter(Boolean);
		if (!words.length || !Number.isFinite(segment.start) || !Number.isFinite(segment.end)) continue;
		const start = Math.max(0, segment.start);
		const end = Math.min(segment.end, maxEndSeconds);
		if (end <= start) continue;
		for (let i=0; i<words.length; i+=limit) {
			const j = Math.min(i+limit, words.length);
			const chunkStart = Math.max(lastEnd, start + (end-start)*i/words.length);
			const chunkEnd = Math.min(end, start + (end-start)*j/words.length);
			if (chunkEnd <= chunkStart) continue;
			captions.push({ text: words.slice(i,j).join(" "), startTime: chunkStart, duration: chunkEnd-chunkStart });
			lastEnd = chunkEnd;
		}
	}
	return captions;
}

/** Join adjacent word timestamps returned by the host before creating captions. */
export function groupTimedWords({ segments, wordsPerChunk }: { segments: TranscriptionSegment[]; wordsPerChunk: number }): TranscriptionSegment[] {
	const groups: TranscriptionSegment[] = [];
	const limit = Math.max(1, Math.floor(wordsPerChunk) || 1);
	let current: TranscriptionSegment | null = null;
	let count = 0;
	for (const segment of segments) {
		const text = segment.text.trim();
		if (!text || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.end <= segment.start) continue;
		const words = text.split(/\s+/).length;
		if (!current || count + words > limit || segment.start - current.end > 0.35) {
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
