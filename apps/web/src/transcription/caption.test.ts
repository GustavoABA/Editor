import { describe, expect, test } from "bun:test";
import { buildCaptionChunks, groupTimedWords } from "./caption";

describe("caption timing", () => {
	test("rapid speech does not accumulate minimum-duration drift", () => {
		const segments = Array.from({ length: 60 }, (_, i) => ({ text: "fala", start: i * 0.15, end: (i + 1) * 0.15 }));
		const captions = buildCaptionChunks({ segments: groupTimedWords({ segments, wordsPerChunk: 3 }), wordsPerChunk: 3, maxEndSeconds: 9 });
		expect(captions.length).toBe(20);
		expect(captions[0].duration).toBeCloseTo(0.45);
		expect(captions.at(-1)!.startTime + captions.at(-1)!.duration).toBeCloseTo(9);
	});
	test("clamps recognition intervals to audio and rejects trailing hallucinations", () => {
		const captions = buildCaptionChunks({ segments: [
			{ text: "última fala", start: 51.7, end: 53 },
			{ text: "fora do áudio", start: 53, end: 56 },
		], maxEndSeconds: 52 });
		expect(captions.length).toBe(1);
		expect(captions[0].startTime + captions[0].duration).toBeCloseTo(52);
	});
	test("preserves pauses and all word-count modes", () => {
		const segments = [{ text: "oi", start: 0, end: 0.12 }, { text: "mundo", start: 1.5, end: 1.7 }];
		for (const wordsPerChunk of [3,5,7]) {
			const captions = buildCaptionChunks({ segments: groupTimedWords({ segments, wordsPerChunk }), wordsPerChunk });
			expect(captions.length).toBe(2);
			expect(captions[0].duration).toBeCloseTo(0.12);
			expect(captions[1].startTime).toBeCloseTo(1.5);
		}
	});
	test("invalid timestamps and overlaps never extend the media", () => {
		const captions = buildCaptionChunks({ segments: [
			{ text: "invalid", start: 2, end: 2 },
			{ text: "um", start: 0, end: 0.3 },
			{ text: "dois", start: 0.2, end: 0.4 },
		], maxEndSeconds: 0.4 });
		expect(captions.length).toBe(2);
		expect(captions[1].startTime).toBeCloseTo(0.3);
		expect(captions[1].startTime + captions[1].duration).toBeCloseTo(0.4);
	});
});
